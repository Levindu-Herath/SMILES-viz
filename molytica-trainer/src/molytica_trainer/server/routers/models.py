import io
import tarfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from starlette.responses import StreamingResponse

from molytica_trainer.services.job_manager import job_manager

router = APIRouter()


@router.get("/models/archive")
async def download_model_archive(path: str = Query(...)):
    """Streams a trained bundle directory as a .tar.gz.

    `path` must be a bundle directory this server itself produced (recorded by
    `job_manager` when a training job completes) and must contain a
    `manifest.json`, so this can't be used to exfiltrate arbitrary files, while
    still allowing users to train into any directory on their own machine.
    """
    bundle_dir = Path(path).resolve()

    if not job_manager.is_known_output_path(str(bundle_dir)):
        raise HTTPException(status_code=403, detail="Path is not a known trained model bundle")

    if not bundle_dir.is_dir() or not (bundle_dir / "manifest.json").is_file():
        raise HTTPException(status_code=404, detail="Bundle not found")

    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        tar.add(bundle_dir, arcname="")
    buffer.seek(0)

    filename = f"{bundle_dir.name}.tar.gz"
    return StreamingResponse(
        buffer,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
