"""
Service layer for dataset upload/browse/download.
Talks to Supabase Storage (bucket "datasets") and the "datasets" table using
the service role key — RLS is bypassed here, so ownership checks that RLS
would otherwise enforce (e.g. delete) are done explicitly in this module.
"""

import uuid
from typing import Optional

from fastapi import UploadFile
from supabase import Client, create_client

from app.core.config import settings

BUCKET_NAME = "datasets"
TABLE_NAME = "datasets"
ALLOWED_EXTENSIONS = {".csv", ".txt", ".zip", ".tsv"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
SIGNED_URL_EXPIRES_IN = 3600  # 1 hour

_client: Optional[Client] = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _client


def _validate_file(file: UploadFile, contents: bytes) -> str:
    """Validate extension and size. Returns the lowercased extension."""
    filename = file.filename or ""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    if len(contents) > MAX_FILE_SIZE:
        raise ValueError("File exceeds the 50MB size limit.")
    return ext


def upload_dataset(
    file: UploadFile,
    name: str,
    description: Optional[str],
    user_id: str,
    user_email: str,
) -> dict:
    """Upload a file to storage and insert its metadata row. Returns the row."""
    contents = file.file.read()
    ext = _validate_file(file, contents)

    file_path = f"{user_id}/{uuid.uuid4()}_{file.filename}"
    content_type = file.content_type or "application/octet-stream"

    client = _get_client()
    client.storage.from_(BUCKET_NAME).upload(
        file_path,
        contents,
        file_options={"content-type": content_type},
    )

    row = {
        "user_id": user_id,
        "name": name,
        "description": description,
        "file_name": file.filename,
        "file_path": file_path,
        "file_size": len(contents),
        "file_type": ext.lstrip("."),
        "uploaded_by_email": user_email,
    }
    result = client.table(TABLE_NAME).insert(row).execute()
    return result.data[0]


def list_datasets() -> list[dict]:
    client = _get_client()
    result = client.table(TABLE_NAME).select("*").order("created_at", desc=True).execute()
    return result.data


def get_dataset(dataset_id: str) -> Optional[dict]:
    client = _get_client()
    result = client.table(TABLE_NAME).select("*").eq("id", dataset_id).limit(1).execute()
    return result.data[0] if result.data else None


def delete_dataset(dataset_id: str, user_id: str) -> None:
    """Delete a dataset's file and row. Raises PermissionError if not the owner."""
    dataset = get_dataset(dataset_id)
    if dataset is None:
        raise ValueError("Dataset not found.")
    if dataset["user_id"] != user_id:
        raise PermissionError("You do not have permission to delete this dataset.")

    client = _get_client()
    client.storage.from_(BUCKET_NAME).remove([dataset["file_path"]])
    client.table(TABLE_NAME).delete().eq("id", dataset_id).execute()


def get_download_url(file_path: str) -> str:
    client = _get_client()
    result = client.storage.from_(BUCKET_NAME).create_signed_url(
        file_path, SIGNED_URL_EXPIRES_IN
    )
    url = result.get("signedURL") or result.get("signedUrl")
    if not url:
        raise ValueError("Failed to generate a download URL.")
    return url
