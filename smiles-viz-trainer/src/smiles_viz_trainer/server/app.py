import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from smiles_viz_trainer.server.routers import health, train, validate

DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def _allowed_origins() -> list[str]:
    extra = os.environ.get("ALLOWED_ORIGINS", "")
    extra_origins = [origin.strip() for origin in extra.split(",") if origin.strip()]
    return DEFAULT_ORIGINS + extra_origins


def create_app() -> FastAPI:
    app = FastAPI(title="smiles-viz-trainer")

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

    return app
