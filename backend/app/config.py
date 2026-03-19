from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve .env relative to this file's location (backend/app/config.py → repo root/.env)
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://solal@localhost:5432/lifeos"
    MISTRAL_API_KEY: str = ""

    # Mistral models
    CHAT_MODEL: str = "mistral-large-latest"
    EMBEDDING_MODEL: str = "mistral-embed"
    EMBEDDING_DIM: int = 1024

    # Web search
    BRAVE_SEARCH_API_KEY: str = ""

    # Voice / transcription
    VOICE_MODEL: str = "voxtral-mini-transcribe-2507"

    # Proactive engine
    PROACTIVE_MODEL: str = "mistral-large-latest"
    PROACTIVE_MAX_ROUNDS: int = 10
    DEDUP_SIMILARITY_THRESHOLD: float = 0.92

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8"}


settings = Settings()
