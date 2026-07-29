"""
Router for dataset upload/browse/download endpoints.
Thin HTTP layer — all logic lives in the service.
"""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.auth import get_current_user

ANONYMOUS_USER_ID = "anonymous"
from app.schemas.dataset import (
    DatasetListResponse,
    DatasetResponse,
    DownloadUrlResponse,
    UploadResponse,
)
from app.services import dataset_service

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.post("/upload", response_model=UploadResponse)
def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    user: Optional[dict] = Depends(get_current_user),
):
    """Auth optional — uploads without a valid Supabase JWT are attributed to an anonymous user."""
    try:
        row = dataset_service.upload_dataset(
            file=file,
            name=name,
            description=description or None,
            user_id=user["id"] if user else ANONYMOUS_USER_ID,
            user_email=user["email"] if user else "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return UploadResponse(dataset=DatasetResponse(**row), message="Dataset uploaded successfully.")


@router.get("", response_model=DatasetListResponse)
def list_datasets(
    user: Optional[dict] = Depends(get_current_user),
):
    """Auth optional."""
    rows = dataset_service.list_datasets()
    return DatasetListResponse(datasets=[DatasetResponse(**row) for row in rows])


@router.get("/{dataset_id}/download", response_model=DownloadUrlResponse)
def download_dataset(
    dataset_id: str,
    user: Optional[dict] = Depends(get_current_user),
):
    """Auth optional."""
    dataset = dataset_service.get_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    url = dataset_service.get_download_url(dataset["file_path"])
    return DownloadUrlResponse(url=url, expires_in=dataset_service.SIGNED_URL_EXPIRES_IN)


@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    user: Optional[dict] = Depends(get_current_user),
):
    """Auth optional. Only the owner may delete when the dataset has an owner on record."""
    try:
        dataset_service.delete_dataset(dataset_id, user["id"] if user else ANONYMOUS_USER_ID)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return {"message": "Dataset deleted successfully."}
