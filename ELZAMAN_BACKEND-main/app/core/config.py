import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_PATH)


def _positive_int_env(name: str, default_value: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default_value
    try:
        value = int(raw)
    except ValueError:
        return default_value
    if value <= 0:
        return default_value
    return value


@dataclass(frozen=True)
class Settings:
    app_name: str
    database_url: str
    default_locale: str
    cookie_name: str
    refresh_cookie_name: str
    jwt_secret_key: str
    jwt_issuer: str
    jwt_access_audience: str
    jwt_refresh_audience: str
    access_token_ttl_minutes: int
    refresh_token_ttl_days: int
    ai_provider: str
    ai_api_key: str | None
    ai_base_url: str
    ai_model: str
    ai_timeout_seconds: int


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(f"DATABASE_URL is missing. Looked for .env at: {ENV_PATH}")

    ai_provider = os.getenv("AI_PROVIDER", "gemini").strip().lower()
    if ai_provider not in {"gemini", "openai"}:
        ai_provider = "gemini"
    default_ai_base_url = (
        "https://generativelanguage.googleapis.com/v1beta"
        if ai_provider == "gemini"
        else "https://api.openai.com/v1"
    )
    default_ai_model = "gemini-2.5-flash-lite" if ai_provider == "gemini" else "gpt-5-nano"

    return Settings(
        app_name=os.getenv("APP_NAME", "Elzaman API"),
        database_url=database_url,
        default_locale=os.getenv("DEFAULT_LOCALE", "ru"),
        cookie_name=os.getenv("COOKIE_NAME", "fmp_session"),
        refresh_cookie_name=os.getenv("REFRESH_COOKIE_NAME", "fmp_refresh"),
        jwt_secret_key=os.getenv("JWT_SECRET_KEY", os.getenv("APP_SECRET_KEY", "change_me")),
        jwt_issuer=os.getenv("JWT_ISSUER", "elzaman"),
        jwt_access_audience=os.getenv("JWT_ACCESS_AUDIENCE", "elzaman-api"),
        jwt_refresh_audience=os.getenv("JWT_REFRESH_AUDIENCE", "elzaman-refresh"),
        access_token_ttl_minutes=_positive_int_env("ACCESS_TOKEN_TTL_MINUTES", 15),
        refresh_token_ttl_days=_positive_int_env("REFRESH_TOKEN_TTL_DAYS", 14),
        ai_provider=ai_provider,
        ai_api_key=os.getenv("AI_API_KEY") or None,
        ai_base_url=os.getenv("AI_BASE_URL", default_ai_base_url).rstrip("/"),
        ai_model=os.getenv("AI_MODEL", default_ai_model),
        ai_timeout_seconds=_positive_int_env("AI_TIMEOUT_SECONDS", 20),
    )
