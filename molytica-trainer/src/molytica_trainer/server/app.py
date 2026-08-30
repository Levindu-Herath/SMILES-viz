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

from molytica_trainer.server.routers import health, train, upload, validate

DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def _allowed_origins() -> list[str]:
    extra = os.environ.get("ALLOWED_ORIGINS", "")
    extra_origins = [origin.strip() for origin in extra.split(",") if origin.strip()]
    return DEFAULT_ORIGINS + extra_origins


def create_app() -> FastAPI:
    app = FastAPI(title="molytica-trainer")

    # No wildcard/regex origin: this server runs locally, reads local files, and
    # executes jobs, so allow_credentials=True must be paired with an explicit
    # origin allowlist only (Starlette echoes the matched origin, never "*").
    # The deployed frontend's exact origin belongs in ALLOWED_ORIGINS, not a
    # "*.vercel.app" pattern that would let any Vercel-hosted site ride the
    # user's credentials against their local trainer.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(validate.router)
    app.include_router(train.router)
    app.include_router(upload.router)

    return app
