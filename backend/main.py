"""
Application factory.
Creates the FastAPI app, registers middleware and routers.
"""

import os
import sys

conda_prefix = os.environ.get("CONDA_PREFIX")
if conda_prefix and sys.platform == "win32":
    dll_dir = os.path.join(conda_prefix, "Library", "bin")
    if os.path.isdir(dll_dir):
        os.add_dll_directory(dll_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import dataset, health, molecule, prediction


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
    )

    # Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(health.router)
    app.include_router(molecule.router)
    app.include_router(prediction.router)
    app.include_router(dataset.router)

    return app


app = create_app()
