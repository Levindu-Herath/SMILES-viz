"""
Pydantic schemas for dataset upload/browse/download requests and responses.
"""

from typing import Optional

from pydantic import BaseModel


class DatasetResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    file_name: str
    file_size: int
    file_type: str
    uploaded_by_email: str
    created_at: str


class DatasetListResponse(BaseModel):
    datasets: list[DatasetResponse]


class DownloadUrlResponse(BaseModel):
    url: str
    expires_in: int


class UploadResponse(BaseModel):
    dataset: DatasetResponse
    message: str
