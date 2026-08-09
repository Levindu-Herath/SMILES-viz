import asyncio
import json
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


def _run_training_thread(job_id: str, req: TrainRequest, smiles_col: str, target_col: str) -> None:
    """Runs in a background thread. Updates job_manager with progress."""
    try:
        def progress_callback(stage, progress, stage_progress, message):
            job_manager.update_progress(job_id, stage, progress, stage_progress, message)

        output_dir = req.output_dir or str(Path.home() / "smiles-viz-models")

        result_data = run_training(
            file_path=req.file_path,
            smiles_column=smiles_col,
            target_column=target_col,
            classifier=req.classifier,
            output_dir=output_dir,
            progress_callback=progress_callback,
            seed=42,
        )

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
    except Exception as e:
        job_manager.fail_job(job_id, str(e))


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

    thread = threading.Thread(
        target=_run_training_thread, args=(job_id, req, smiles_col, target_col), daemon=True
    )
    thread.start()

    return TrainResponse(job_id=job_id, message="Training started")


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

            await asyncio.sleep(1)
    except (asyncio.CancelledError, GeneratorExit):
        return


@router.get("/train/{job_id}/stream")
async def stream_training(job_id: str):
    return EventSourceResponse(_event_generator(job_id))
