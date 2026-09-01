"""
Service layer for the published-model registry: publish a trained bundle
(uploaded from the trainer as a .tar.gz) and serve predictions from it.

Talks to Supabase Storage (bucket "models") and the "models" table using the
service role key, mirroring dataset_service.py. Published bundles are
extracted to a local on-disk cache the first time they're needed for a
prediction, then a MolecularActivityPredictor is built from that directory
and kept in memory — same shape as ml_pipeline.inference's singleton, but
keyed by model id.
"""

import io
import json
import tarfile
import threading
import uuid
from pathlib import Path
from typing import Optional

from fastapi import UploadFile
from supabase import Client, create_client

from app.core.config import settings
from ml_pipeline.inference import MolecularActivityPredictor

BACKEND_DIR = Path(__file__).resolve().parents[2]
CACHE_ROOT = BACKEND_DIR / "artifacts" / "published"

BUCKET_NAME = "models"
TABLE_NAME = "models"
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB

_client: Optional[Client] = None
_predictors: dict[str, MolecularActivityPredictor] = {}
_predictors_lock = threading.Lock()


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _client


def _read_manifest_from_archive(contents: bytes) -> dict:
    try:
        with tarfile.open(fileobj=io.BytesIO(contents), mode="r:gz") as tar:
            member = tar.getmember("manifest.json")
            with tar.extractfile(member) as f:  # type: ignore[union-attr]
                return json.load(f)
    except (tarfile.TarError, KeyError, json.JSONDecodeError) as exc:
        raise ValueError("Not a valid model bundle archive (missing/invalid manifest.json).") from exc


def publish_model(file: UploadFile, name: str, user_id: str) -> dict:
    """Upload a trained bundle archive to storage and insert its registry row."""
    filename = file.filename or ""
    if not filename.endswith(".tar.gz"):
        raise ValueError("Expected a .tar.gz model bundle archive.")

    contents = file.file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise ValueError("Archive exceeds the 200MB size limit.")

    manifest = _read_manifest_from_archive(contents)
    default_model = manifest.get("default_model")
    available_models = list(manifest.get("models", {}).keys())
    if not default_model or not available_models:
        raise ValueError("Bundle manifest is missing model information.")

    file_path = f"{user_id}/{uuid.uuid4()}_{name}.tar.gz"

    client = _get_client()
    client.storage.from_(BUCKET_NAME).upload(
        file_path,
        contents,
        file_options={"content-type": "application/gzip"},
    )

    row = {
        "user_id": user_id,
        "name": name,
        "dataset": manifest.get("dataset"),
        "implementation": manifest.get("implementation"),
        "default_model": default_model,
        "available_models": available_models,
        "metrics": {},
        "file_path": file_path,
    }
    result = client.table(TABLE_NAME).insert(row).execute()
    return result.data[0]


def list_my_models(user_id: str) -> list[dict]:
    client = _get_client()
    result = (
        client.table(TABLE_NAME)
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def get_model(model_id: str) -> Optional[dict]:
    client = _get_client()
    result = client.table(TABLE_NAME).select("*").eq("id", model_id).limit(1).execute()
    return result.data[0] if result.data else None


def _extract_bundle(file_path: str, cache_dir: Path) -> None:
    client = _get_client()
    contents = client.storage.from_(BUCKET_NAME).download(file_path)
    cache_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(contents), mode="r:gz") as tar:
        # `filter="data"` (PEP 706) rejects absolute paths / traversal / device files —
        # available on Python 3.12+; older tarfile versions ignore the kwarg.
        if hasattr(tarfile, "data_filter"):
            tar.extractall(cache_dir, filter="data")
        else:
            tar.extractall(cache_dir)


def get_predictor_for(model_id: str) -> MolecularActivityPredictor:
    """Loads (and caches) the predictor for a published bundle. Raises ValueError if not found."""
    with _predictors_lock:
        predictor = _predictors.get(model_id)
        if predictor is not None:
            return predictor

        row = get_model(model_id)
        if row is None:
            raise ValueError(f"Model '{model_id}' not found.")

        cache_dir = CACHE_ROOT / model_id
        if not (cache_dir / "manifest.json").is_file():
            _extract_bundle(row["file_path"], cache_dir)

        predictor = MolecularActivityPredictor(cache_dir)
        _predictors[model_id] = predictor
        return predictor
