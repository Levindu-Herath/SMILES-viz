import os
import string
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter()

ALLOWED_EXTENSIONS = {".csv", ".tsv"}
UPLOAD_DIR = Path.home() / "smiles-viz-uploads"


@router.post("/upload")
async def upload_dataset(file: UploadFile):
    original_name = file.filename or "dataset"
    ext = Path(original_name).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Only .csv and .tsv files are accepted.",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    safe_name = f"{uuid.uuid4().hex}_{Path(original_name).name}"
    dest_path = UPLOAD_DIR / safe_name

    contents = await file.read()
    with open(dest_path, "wb") as f:
        f.write(contents)

    return {"file_path": str(dest_path.resolve())}


class DirectoryEntry(BaseModel):
    name: str
    path: str


class BrowseDirectoriesResponse(BaseModel):
    current_path: str
    parent_path: str | None
    directories: list[DirectoryEntry]


class CreateDirectoryRequest(BaseModel):
    path: str


class CreateDirectoryResponse(BaseModel):
    path: str


class DrivesResponse(BaseModel):
    drives: list[str]


@router.get("/browse-directories", response_model=BrowseDirectoriesResponse)
async def browse_directories(path: str | None = None):
    target = Path(path) if path else Path.home()

    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"'{target}' is not a directory")

    target = target.resolve()

    directories: list[DirectoryEntry] = []
    try:
        entries = sorted(target.iterdir(), key=lambda p: p.name.lower())
    except PermissionError:
        entries = []

    for entry in entries:
        try:
            if entry.is_dir():
                directories.append(DirectoryEntry(name=entry.name, path=str(entry)))
        except (PermissionError, OSError):
            continue

    parent = target.parent
    parent_path = str(parent) if parent != target else None

    return BrowseDirectoriesResponse(
        current_path=str(target),
        parent_path=parent_path,
        directories=directories,
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
