"""
Application configuration.
Reads from environment variables with sensible defaults.
"""

import json
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode

# backend/app/core/config.py -> backend/
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    APP_NAME: str = "SMILES Visualizer API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    # CORS (comma-separated string via env var, e.g. "https://a.com,https://b.com")
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v):
        if isinstance(v, str):
            # Support the legacy JSON-array format (e.g. `["http://a.com"]`)
            # as well as a plain comma-separated string.
            try:
                decoded = json.loads(v)
                if isinstance(decoded, list):
                    return decoded
            except json.JSONDecodeError:
                pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # SVG rendering defaults
    SVG_WIDTH: int = 450
    SVG_HEIGHT: int = 350

    # SMILES input constraints
    SMILES_MAX_LENGTH: int = 500

    # Supabase Auth
    SUPABASE_URL: str = ""
    SUPABASE_JWT_SECRET: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # ML prediction pipeline
    # Default path names a specific trained bundle inside the pinned `sparsegraphs`
    # submodule commit (see .gitmodules). If the submodule is advanced to a commit
    # whose exported bundle has a different directory name, update this default or
    # set the ARTIFACT_DIR env var to override it.
    ARTIFACT_DIR: str = (
        "sparsegraphs/artifacts/wl_fddl_gpu_nci_full_atoms4096_20260719_123451_20260719_142411"
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def artifact_dir_path(self) -> Path:
        """Absolute path to the ML artifact bundle, resolved relative to backend/."""
        path = Path(self.ARTIFACT_DIR)
        return path if path.is_absolute() else BACKEND_DIR / path


settings = Settings()
