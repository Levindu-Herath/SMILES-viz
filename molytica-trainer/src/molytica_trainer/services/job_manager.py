import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from molytica_trainer.server.schemas.training import JobStatus, TrainingResult, TrainingStage

TERMINAL_STAGES = {TrainingStage.COMPLETED, TrainingStage.FAILED, TrainingStage.CANCELLED}


class JobManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._job: JobStatus | None = None
        self._result: TrainingResult | None = None
        self._known_output_paths: set[str] = set()
        self._cancel_requested_job_id: str | None = None

    def create_job(self, classifier: str) -> str:
        with self._lock:
            if self._job is not None and self._job.status not in TERMINAL_STAGES:
                raise ValueError("A training job is already running")

            job_id = str(uuid4())
            now = datetime.now(timezone.utc)
            self._job = JobStatus(
                job_id=job_id,
                status=TrainingStage.VALIDATING,
                progress=0.0,
                current_stage_progress=0.0,
                message="Job created",
                created_at=now,
                updated_at=now,
            )
            self._result = None
            self._cancel_requested_job_id = None
            return job_id

    def get_job(self, job_id: str) -> JobStatus | None:
        with self._lock:
            if self._job is not None and self._job.job_id == job_id:
                return self._job
            return None

    def update_progress(
        self,
        job_id: str,
        stage: TrainingStage,
        progress: float,
        stage_progress: float,
        message: str,
    ) -> None:
        with self._lock:
            if self._job is None or self._job.job_id != job_id:
                return
            self._job.status = stage
            self._job.progress = progress
            self._job.current_stage_progress = stage_progress
            self._job.message = message
            self._job.updated_at = datetime.now(timezone.utc)

    def fail_job(self, job_id: str, error: str) -> None:
        with self._lock:
            if self._job is None or self._job.job_id != job_id:
                return
            self._job.status = TrainingStage.FAILED
            self._job.error = error
            self._job.updated_at = datetime.now(timezone.utc)

    def request_cancel(self, job_id: str) -> bool:
        """Marks a running job for cancellation. Returns False if it can't be cancelled
        (unknown job, or already finished)."""
        with self._lock:
            if self._job is None or self._job.job_id != job_id:
                return False
            if self._job.status in TERMINAL_STAGES:
                return False
            self._cancel_requested_job_id = job_id
            return True

    def is_cancel_requested(self, job_id: str) -> bool:
        with self._lock:
            return self._cancel_requested_job_id == job_id

    def cancel_job(self, job_id: str) -> None:
        with self._lock:
            if self._job is None or self._job.job_id != job_id:
                return
            self._job.status = TrainingStage.CANCELLED
            self._job.message = "Training cancelled"
            self._job.updated_at = datetime.now(timezone.utc)

    def complete_job(self, job_id: str, result: TrainingResult) -> None:
        with self._lock:
            if self._job is None or self._job.job_id != job_id:
                return
            self._job.status = TrainingStage.COMPLETED
            self._job.progress = 1.0
            self._job.current_stage_progress = 1.0
            self._job.updated_at = datetime.now(timezone.utc)
            self._result = result
            self._known_output_paths.add(str(Path(result.output_path).resolve()))

    def is_known_output_path(self, path: str) -> bool:
        with self._lock:
            try:
                resolved = str(Path(path).resolve())
            except OSError:
                return False
            return resolved in self._known_output_paths

    def get_result(self, job_id: str) -> TrainingResult | None:
        with self._lock:
            if self._result is not None and self._result.job_id == job_id:
                return self._result
            return None

    def get_current_job(self) -> JobStatus | None:
        with self._lock:
            return self._job


# Module-level singleton
job_manager = JobManager()
