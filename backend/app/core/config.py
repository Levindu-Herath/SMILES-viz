"""
Application configuration.
Reads from environment variables with sensible defaults.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode

# backend/app/core/config.py -> backend/
BACKEND_DIR = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class ReferenceDisease:
    id: str            # stable slug used across the API and UI
    label: str         # public-facing cancer-type name shown to users
    nci_id: int        # NCI assay id (provenance shown as a small sublabel)
    artifact_dir: str  # bundle path relative to backend/ (or absolute)


# Single source of truth for the built-in reference predictors. To add a cancer
# type, append one entry whose bundle exists in the pinned sparsegraphs commit.
REFERENCE_DISEASES: tuple[ReferenceDisease, ...] = (
    ReferenceDisease(
        id="lung",
        label="Lung cancer",
        nci_id=1,
        artifact_dir="sparsegraphs/artifacts/wl_fddl_gpu_nci_full_atoms4096_20260719_123451_20260719_142411",
    ),
    ReferenceDisease(
        id="prostate",
        label="Prostate cancer",
        nci_id=41,
        artifact_dir="sparsegraphs/artifacts/wl_fddl_gpu_nci_full_id41_atoms4096_20260902_025157_20260902_025843",
    ),
    ReferenceDisease(
        id="melanoma",
        label="Melanoma",
        nci_id=33,
        artifact_dir="sparsegraphs/artifacts/wl_fddl_gpu_nci_full_id33_atoms4096_20260902_152156_20260902_153206",
    ),
)
DEFAULT_DISEASE_ID = "lung"


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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def default_disease_id(self) -> str:
        return DEFAULT_DISEASE_ID

    def reference_diseases(self) -> tuple[ReferenceDisease, ...]:
        return REFERENCE_DISEASES

    def disease_ids(self) -> list[str]:
        return [d.id for d in REFERENCE_DISEASES]

    def disease(self, disease_id: str) -> ReferenceDisease:
        for d in REFERENCE_DISEASES:
            if d.id == disease_id:
                return d
        raise KeyError(disease_id)

    def artifact_dir_path_for(self, disease_id: str) -> Path:
        """Absolute path to a disease's bundle, resolved relative to backend/."""
        path = Path(self.disease(disease_id).artifact_dir)
        return path if path.is_absolute() else BACKEND_DIR / path

    @property
    def artifact_dir_path(self) -> Path:
        """Default disease's bundle — kept so SPARSEGRAPHS_DIR still resolves."""
        return self.artifact_dir_path_for(self.default_disease_id)


settings = Settings()
