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


def _string_env_or_none(name: str) -> str | None:
    raw = os.getenv(name)
    if raw is None:
        return None

    value = raw.strip()
    return value or None


def _csv_int_env(name: str) -> tuple[int, ...]:
    raw = _string_env_or_none(name)
    if not raw:
        return ()

    values: list[int] = []
    for item in raw.split(","):
        chunk = item.strip()
        if not chunk:
            continue
        try:
            values.append(int(chunk))
        except ValueError:
            continue

    return tuple(values)


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
    telegram_bot_token: str | None
    telegram_bot_username: str | None
    telegram_webhook_secret: str | None
    telegram_admin_chat_ids: tuple[int, ...]
    telegram_payment_qr_url: str | None
    telegram_support_url: str
    telegram_premium_price_label: str
    telegram_premium_days: int
    telegram_premium_plan_code: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(f"DATABASE_URL is missing. Looked for .env at: {ENV_PATH}")

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
        telegram_bot_token=_string_env_or_none("TELEGRAM_BOT_TOKEN"),
        telegram_bot_username=_string_env_or_none("TELEGRAM_BOT_USERNAME"),
        telegram_webhook_secret=_string_env_or_none("TELEGRAM_WEBHOOK_SECRET"),
        telegram_admin_chat_ids=_csv_int_env("TELEGRAM_ADMIN_CHAT_IDS"),
        telegram_payment_qr_url=_string_env_or_none("TELEGRAM_PAYMENT_QR_URL"),
        telegram_support_url=os.getenv("TELEGRAM_SUPPORT_URL", "https://www.instagram.com/elzaman.kg").strip(),
        telegram_premium_price_label=os.getenv("TELEGRAM_PREMIUM_PRICE_LABEL", "149 KGS / month").strip(),
        telegram_premium_days=_positive_int_env("TELEGRAM_PREMIUM_DAYS", 30),
        telegram_premium_plan_code=os.getenv("TELEGRAM_PREMIUM_PLAN_CODE", "telegram_qr_manual").strip(),
    )
