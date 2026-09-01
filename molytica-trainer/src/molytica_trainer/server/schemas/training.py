from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class ValidateDatasetRequest(BaseModel):
    file_path: str


class InvalidRow(BaseModel):
    row: int
    smiles: str
    error: str


class DatasetValidationResponse(BaseModel):
    file_path: str
    file_format: str | None = None
    total_rows: int
    valid_smiles: int
    invalid_smiles: int
    invalid_rows: list[InvalidRow]
    columns: list[str]
    detected_smiles_column: str | None
    detected_target_column: str | None
    target_value_counts: dict
    is_valid: bool
    errors: list[str]
    warnings: list[str]


class TrainRequest(BaseModel):
    file_path: str
    smiles_column: str | None = None
    target_column: str | None = None
    classifier: str
    output_dir: str | None = None
    parameters: dict | None = None


class TrainingStage(str, Enum):
    VALIDATING = "VALIDATING"
    ENCODING = "ENCODING"
    SPARSE_CODING = "SPARSE_CODING"
    NORMALIZING = "NORMALIZING"
    TRAINING = "TRAINING"
    EVALUATING = "EVALUATING"
    SAVING = "SAVING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class JobStatus(BaseModel):
    job_id: str
    status: TrainingStage
    progress: float
    current_stage_progress: float
    message: str
    created_at: datetime
    updated_at: datetime
    error: str | None = None


class TrainResponse(BaseModel):
    job_id: str
    message: str = "Training started"


class TrainingResult(BaseModel):
    job_id: str
    status: TrainingStage
    classifier: str
    dataset_path: str
    total_molecules: int
    valid_molecules: int
    training_duration_seconds: float
    output_path: str
    metrics: dict[str, float]
