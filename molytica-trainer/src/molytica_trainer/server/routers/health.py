from fastapi import APIRouter

from molytica_trainer import __version__

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "version": __version__}
