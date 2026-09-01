import asyncio
import json
import multiprocessing as mp
import queue
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from molytica_trainer.pipeline.runner import run_training
from molytica_trainer.server.schemas.training import (
    JobStatus,
    TrainingResult,
    TrainingStage,
    TrainRequest,
    TrainResponse,
)
from molytica_trainer.services.job_manager import job_manager
from molytica_trainer.utils.dataset import validate_dataset

router = APIRouter()

# Tracks the OS process running each job's training, so a cancel request can kill it
# outright — training runs CPU-bound C code (sklearn/FDDL) that a Python-level "please
# stop" flag can't interrupt, so a separate process + hard termination is the only way
# to make Cancel actually immediate.
_processes: dict[str, "mp.Process"] = {}
_processes_lock = threading.Lock()


def _training_worker(
    progress_queue: "mp.Queue",
    file_path: str,
    smiles_col: str,
    target_col: str,
    classifier: str,
    output_dir: str,
) -> None:
    """Entry point that runs inside the child process. Must stay at module level so it
    can be pickled for multiprocessing."""

    def progress_callback(stage, progress, stage_progress, message):
        progress_queue.put(("progress", stage, progress, stage_progress, message))

    try:
        result_data = run_training(
            file_path=file_path,
            smiles_column=smiles_col,
            target_column=target_col,
            classifier=classifier,
            output_dir=output_dir,
            progress_callback=progress_callback,
            seed=42,
        )
        progress_queue.put(("complete", result_data))
    except Exception as e:
        progress_queue.put(("error", str(e)))


def _watch_job(job_id: str, req: TrainRequest, process: "mp.Process", progress_queue: "mp.Queue") -> None:
    """Runs in a background thread of the server process. Drains progress_queue and
    reflects the child process's outcome into job_manager. If the process disappears
    without ever reporting a result, that means it was killed (cancelled)."""
    try:
        while True:
            try:
                kind, *payload = progress_queue.get(timeout=0.5)
            except queue.Empty:
                if not process.is_alive():
                    if job_manager.is_cancel_requested(job_id):
                        job_manager.cancel_job(job_id)
                    else:
                        job_manager.fail_job(job_id, "Training process terminated unexpectedly")
                    return
                continue

            if kind == "progress":
                stage, progress, stage_progress, message = payload
                job_manager.update_progress(job_id, stage, progress, stage_progress, message)
            elif kind == "complete":
                (result_data,) = payload
                training_result = TrainingResult(
                    job_id=job_id,
                    status=TrainingStage.COMPLETED,
                    classifier=req.classifier,
                    dataset_path=req.file_path,
                    total_molecules=result_data["total_molecules"],
                    valid_molecules=result_data["valid_molecules"],
                    training_duration_seconds=result_data["training_duration_seconds"],
                    output_path=result_data["output_path"],
                    metrics=result_data["metrics"],
                )
                job_manager.complete_job(job_id, training_result)
                return
            elif kind == "error":
                (error,) = payload
                job_manager.fail_job(job_id, error)
                return
    finally:
        with _processes_lock:
            _processes.pop(job_id, None)
        process.join(timeout=1)


@router.post("/train", response_model=TrainResponse)
async def start_training(req: TrainRequest):
    validation = validate_dataset(req.file_path)
    if not validation.is_valid:
        raise HTTPException(status_code=400, detail=validation.errors)

    smiles_col = req.smiles_column or validation.detected_smiles_column
    target_col = req.target_column or validation.detected_target_column

    if validation.file_format == "csv" and not smiles_col:
        raise HTTPException(status_code=400, detail="smiles_column is required for CSV datasets")

    try:
        job_id = job_manager.create_job(req.classifier)
    except ValueError:
        raise HTTPException(status_code=409, detail="A training job is already running")

    output_dir = req.output_dir or str(Path.home() / "smiles-viz-models")

    ctx = mp.get_context("spawn")
    progress_queue = ctx.Queue()
    process = ctx.Process(
        target=_training_worker,
        args=(progress_queue, req.file_path, smiles_col, target_col, req.classifier, output_dir),
        daemon=True,
    )
    process.start()

    with _processes_lock:
        _processes[job_id] = process

    watcher = threading.Thread(target=_watch_job, args=(job_id, req, process, progress_queue), daemon=True)
    watcher.start()

    return TrainResponse(job_id=job_id, message="Training started")


@router.post("/train/{job_id}/cancel")
async def cancel_training(job_id: str):
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    with _processes_lock:
        process = _processes.get(job_id)

    if process is None or not process.is_alive():
        raise HTTPException(status_code=409, detail="Job is not running")

    # Mark this as a requested cancellation *before* killing the process, so the
    # watcher thread can tell a deliberate stop apart from an unexpected crash.
    job_manager.request_cancel(job_id)
    process.terminate()  # forcibly kills the OS process immediately, regardless of what it's doing

    return {"message": "Training stopped"}


@router.get("/train/{job_id}/status", response_model=JobStatus)
async def get_training_status(job_id: str):
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/train/{job_id}/result", response_model=TrainingResult)
async def get_training_result(job_id: str):
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != TrainingStage.COMPLETED:
        raise HTTPException(status_code=400, detail="Training not yet complete")
    result = job_manager.get_result(job_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return result


async def _event_generator(job_id: str):
    last_progress = -1.0
    try:
        while True:
            job = job_manager.get_job(job_id)
            if job is None:
                break

            if job.progress != last_progress or job.status in (
                TrainingStage.COMPLETED,
                TrainingStage.FAILED,
                TrainingStage.CANCELLED,
            ):
                last_progress = job.progress
                yield {
                    "event": "progress",
                    "data": job.model_dump_json(),
                }

            if job.status == TrainingStage.COMPLETED:
                result = job_manager.get_result(job_id)
                if result:
                    yield {
                        "event": "complete",
                        "data": result.model_dump_json(),
                    }
                break

            if job.status == TrainingStage.FAILED:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": job.error}),
                }
                break

            if job.status == TrainingStage.CANCELLED:
                yield {
                    "event": "cancelled",
                    "data": json.dumps({"message": job.message}),
                }
                break

            await asyncio.sleep(0.5)
    except (asyncio.CancelledError, GeneratorExit):
        return


@router.get("/train/{job_id}/stream")
async def stream_training(job_id: str):
    return EventSourceResponse(_event_generator(job_id))
