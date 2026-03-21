import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from app.modules.auth.router import me as auth_me
from app.modules.profile import service as profile_service


def _user(created_at: datetime):
    return SimpleNamespace(
        id=7,
        email="u@example.com",
        created_at=created_at,
        role="admin",
        nickname="neo",
        first_name="Neo",
        last_name="Anderson",
        gender="male",
        birth_date=None,
        level=1,
        experience=0,
        timezone="UTC",
        timezone_changed_at=None,
        streak_current=0,
        streak_best=0,
        streak_last_local_date=None,
        delete_requested_at=None,
        delete_effective_at=None,
        deleted_at=None,
    )


def test_build_profile_payload_includes_created_at(monkeypatch):
    async def _fake_is_premium_user(db, user_id: int) -> bool:
        return False

    monkeypatch.setattr(profile_service, "is_premium_user", _fake_is_premium_user)

    user = _user(datetime(2026, 2, 24, 10, 15, tzinfo=timezone.utc))
    payload = asyncio.run(profile_service.build_profile_payload(db=object(), user=user))

    assert payload["created_at"] == "2026-02-24T10:15:00Z"
    assert payload["role"] == "admin"


def test_auth_me_includes_created_at():
    user = _user(datetime(2026, 2, 24, 10, 15, tzinfo=timezone.utc))
    payload = asyncio.run(auth_me(user=user))

    assert payload["ok"] is True
    assert payload["user"]["created_at"] == "2026-02-24T10:15:00Z"
    assert payload["user"]["role"] == "admin"
