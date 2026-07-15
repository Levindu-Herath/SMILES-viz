"""
Application configuration.
Reads from environment variables with sensible defaults.
"""

from pathlib import Path

from pydantic_settings import BaseSettings

# backend/app/core/config.py -> backend/
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    APP_NAME: str = "SMILES Visualizer API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

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

    # ML prediction pipeline
    ARTIFACT_DIR: str = (
        "sparsegraphs/artifacts/wl_fddl_gpu_nci_full_atoms32_20260708_202033_20260708_202100"
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def artifact_dir_path(self) -> Path:
        """Absolute path to the ML artifact bundle, resolved relative to backend/."""
        path = Path(self.ARTIFACT_DIR)
        return path if path.is_absolute() else BACKEND_DIR / path


settings = Settings()
