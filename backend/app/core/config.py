"""
Application configuration.
Reads from environment variables with sensible defaults.
"""

from pydantic_settings import BaseSettings


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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
