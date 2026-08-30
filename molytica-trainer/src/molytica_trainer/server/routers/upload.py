import os
import string
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter()

ALLOWED_EXTENSIONS = {".csv", ".tsv", ".txt", ".sdf"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB, mirrors backend/app/services/dataset_service.py
UPLOAD_DIR = Path.home() / "smiles-viz-uploads"


@router.post("/upload")
async def upload_dataset(file: UploadFile):
    original_name = file.filename or "dataset"
    ext = Path(original_name).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{ext}'. Only .csv, .tsv, .txt, and .sdf files are accepted.",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=422,
            detail=f"File exceeds the {MAX_FILE_SIZE // (1024 * 1024)}MB size limit.",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    safe_name = f"{uuid.uuid4().hex}_{Path(original_name).name}"
    dest_path = UPLOAD_DIR / safe_name

    with open(dest_path, "wb") as f:
        f.write(contents)

    return {"file_path": str(dest_path.resolve())}


class DirectoryEntry(BaseModel):
    name: str
    path: str


class FileEntry(BaseModel):
    name: str
    path: str
    extension: str
    size_bytes: int


class BrowseDirectoriesResponse(BaseModel):
    current_path: str
    parent_path: str | None
    directories: list[DirectoryEntry]
    files: list[FileEntry] = []


class CreateDirectoryRequest(BaseModel):
    path: str


class CreateDirectoryResponse(BaseModel):
    path: str


class DrivesResponse(BaseModel):
    drives: list[str]


@router.get("/browse-directories", response_model=BrowseDirectoriesResponse)
async def browse_directories(
    path: str | None = None,
    include_files: bool = False,
    file_extensions: str | None = None,
):
    target = Path(path) if path else Path.home()

    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"'{target}' is not a directory")

    target = target.resolve()

    allowed_exts = set()
    if file_extensions:
        allowed_exts = {ext.strip().lower() for ext in file_extensions.split(",")}

    directories: list[DirectoryEntry] = []
    files: list[FileEntry] = []
    try:
        entries = sorted(target.iterdir(), key=lambda p: p.name.lower())
    except PermissionError:
        entries = []

    for entry in entries:
        try:
            if entry.is_dir():
                directories.append(DirectoryEntry(name=entry.name, path=str(entry)))
            elif include_files and entry.is_file():
                ext = entry.suffix.lower()
                if not allowed_exts or ext in allowed_exts:
                    files.append(
                        FileEntry(
                            name=entry.name,
                            path=str(entry),
                            extension=ext,
                            size_bytes=entry.stat().st_size,
                        )
                    )
        except (PermissionError, OSError):
            continue

    parent = target.parent
    parent_path = str(parent) if parent != target else None

    return BrowseDirectoriesResponse(
        current_path=str(target),
        parent_path=parent_path,
        directories=directories,
        files=files,
    )


@router.post("/browse-directories/create", response_model=CreateDirectoryResponse)
async def create_directory(req: CreateDirectoryRequest):
    os.makedirs(req.path, exist_ok=True)
    return CreateDirectoryResponse(path=str(Path(req.path).resolve()))


@router.get("/browse-directories/drives", response_model=DrivesResponse)
async def list_drives():
    drives = [
        f"{letter}:\\"
        for letter in string.ascii_uppercase
        if os.path.exists(f"{letter}:\\")
    ]
    return DrivesResponse(drives=drives)
