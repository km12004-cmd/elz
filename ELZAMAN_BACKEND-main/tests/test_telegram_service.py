import pytest
from fastapi import HTTPException

from app.core.config import get_settings
from app.modules.telegram.service import verify_webhook_secret


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_verify_webhook_secret_allows_when_secret_is_not_configured(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    verify_webhook_secret(None)


def test_verify_webhook_secret_accepts_matching_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "expected-secret")
    verify_webhook_secret("expected-secret")


def test_verify_webhook_secret_rejects_invalid_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "expected-secret")

    with pytest.raises(HTTPException) as exc_info:
        verify_webhook_secret("wrong-secret")

    assert exc_info.value.status_code == 403
