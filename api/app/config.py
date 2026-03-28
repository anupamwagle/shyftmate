from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# config.py lives at  api/app/config.py
# .env.dev lives at   <monorepo-root>/.env.dev  (two levels up)
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _REPO_ROOT / ".env.dev"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Core
    ENV: Literal["dev", "prod"] = "dev"
    API_BASE_URL: str = "http://localhost:8000"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:8081"

    # Database
    DATABASE_URL: str
    DATABASE_URL_SYNC: str = ""

    # JWT
    JWT_SECRET: str
    JWT_ACCESS_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_EXPIRE_DAYS: int = 7
    JWT_ALGORITHM: str = "HS256"

    # LLM
    LLM_PROVIDER: Literal["anthropic", "ollama"] = "ollama"
    ANTHROPIC_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3"

    # Google OAuth2
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Apple Sign In
    APPLE_CLIENT_ID: str = ""
    APPLE_TEAM_ID: str = ""
    APPLE_KEY_ID: str = ""
    APPLE_PRIVATE_KEY_PATH: str = "./apple_auth_key.p8"

    # AWS SES
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_SES_REGION: str = "ap-southeast-2"
    SES_FROM_EMAIL: str = "no-reply@gator.ai"
    SES_FROM_NAME: str = "Gator"

    # SignalWire (telephony)
    SIGNALWIRE_PROJECT_ID: str = ""
    SIGNALWIRE_TOKEN: str = ""
    SIGNALWIRE_SPACE_URL: str = ""
    SIGNALWIRE_PHONE_NUMBER: str = ""

    # AWS Transcribe + Polly
    AWS_TRANSCRIBE_REGION: str = "ap-southeast-2"
    AWS_POLLY_REGION: str = "ap-southeast-2"
    POLLY_VOICE_ID: str = "Olivia"
    POLLY_ENGINE: str = "neural"
    POLLY_LANGUAGE_CODE: str = "en-AU"

    # Kronos
    KRONOS_BASE_URL: str = ""
    KRONOS_CLIENT_ID: str = ""
    KRONOS_CLIENT_SECRET: str = ""
    KRONOS_COMPANY_SHORT_NAME: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Super Admin
    SUPER_ADMIN_EMAIL: str = "superadmin@gator.local"
    SUPER_ADMIN_PASSWORD: str = "ChangeMe123!"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    @property
    def is_dev(self) -> bool:
        return self.ENV == "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
