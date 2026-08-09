from dataclasses import asdict

from fastapi import APIRouter

from molytica_trainer.server.schemas.training import (
    DatasetValidationResponse,
    ValidateDatasetRequest,
)
from molytica_trainer.utils.dataset import validate_dataset

router = APIRouter()


@router.post("/validate-dataset", response_model=DatasetValidationResponse)
async def validate_dataset_endpoint(request: ValidateDatasetRequest):
    result = validate_dataset(request.file_path)
    return DatasetValidationResponse(**asdict(result))
