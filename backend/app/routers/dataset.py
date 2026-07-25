"""
Router for dataset upload/browse/download endpoints.
Thin HTTP layer — all logic lives in the service.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.auth import get_current_user
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
    user: dict = Depends(get_current_user),
):
    """Protected endpoint — requires a valid Supabase JWT."""
    try:
        row = dataset_service.upload_dataset(
            file=file,
            name=name,
            description=description or None,
            user_id=user["id"],
            user_email=user["email"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return UploadResponse(dataset=DatasetResponse(**row), message="Dataset uploaded successfully.")


@router.get("", response_model=DatasetListResponse)
def list_datasets(
    user: dict = Depends(get_current_user),
):
    """Protected endpoint — requires a valid Supabase JWT."""
    rows = dataset_service.list_datasets()
    return DatasetListResponse(datasets=[DatasetResponse(**row) for row in rows])


@router.get("/{dataset_id}/download", response_model=DownloadUrlResponse)
def download_dataset(
    dataset_id: str,
    user: dict = Depends(get_current_user),
):
    """Protected endpoint — requires a valid Supabase JWT."""
    dataset = dataset_service.get_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    url = dataset_service.get_download_url(dataset["file_path"])
    return DownloadUrlResponse(url=url, expires_in=dataset_service.SIGNED_URL_EXPIRES_IN)


@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    user: dict = Depends(get_current_user),
):
    """Protected endpoint — requires a valid Supabase JWT. Only the owner may delete."""
    try:
        dataset_service.delete_dataset(dataset_id, user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return {"message": "Dataset deleted successfully."}
