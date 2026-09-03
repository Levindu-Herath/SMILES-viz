import os

_conda_prefix = os.environ.get("CONDA_PREFIX", "")
if _conda_prefix:
    for _dll_dir in [
        os.path.join(_conda_prefix, "Library", "bin"),
        os.path.join(_conda_prefix, "Library", "lib"),
        os.path.join(_conda_prefix, "DLLs"),
    ]:
        if os.path.isdir(_dll_dir):
            os.add_dll_directory(_dll_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from molytica_trainer.server.middleware import PrivateNetworkAccessMiddleware
from molytica_trainer.server.routers import health, models, train, upload, validate

DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def _allowed_origins() -> list[str]:
    extra = os.environ.get("ALLOWED_ORIGINS", "")
    extra_origins = [origin.strip() for origin in extra.split(",") if origin.strip()]
    return DEFAULT_ORIGINS + extra_origins


def create_app() -> FastAPI:
    app = FastAPI(title="molytica-trainer")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_origin_regex=r"https://.*\.vercel\.app",
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.add_middleware(PrivateNetworkAccessMiddleware)

    app.include_router(health.router)
    app.include_router(validate.router)
    app.include_router(train.router)
    app.include_router(upload.router)
    app.include_router(models.router)

    return app
