from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status

from app.core.security import validate_password, verify_password
from app.modules.auth import crud


def auth_success_payload(access_token: str, access_expires_at: datetime) -> dict[str, object]:
    return {
        "ok": True,
        "token_type": "bearer",
        "access_token": access_token,
        "access_expires_at": f"{access_expires_at.isoformat()}Z",
    }


def _resolve_local_date(*, now: datetime, timezone_name: str | None) -> date:
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    else:
        now = now.astimezone(timezone.utc)

    try:
        tz = ZoneInfo(timezone_name or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")
    return now.astimezone(tz).date()


def update_visit_streak(user, *, now: datetime | None = None) -> bool:
    now_utc = now or datetime.utcnow()
    local_today = _resolve_local_date(now=now_utc, timezone_name=getattr(user, "timezone", "UTC"))
    last_local_date = user.streak_last_local_date

    if last_local_date is None:
        user.streak_current = 1
        user.streak_best = max(int(user.streak_best or 0), 1)
        user.streak_last_local_date = local_today
        return True

    if local_today <= last_local_date:
        return False

    if local_today == last_local_date + timedelta(days=1):
        user.streak_current = int(user.streak_current or 0) + 1
    else:
        user.streak_current = 1

    user.streak_best = max(int(user.streak_best or 0), int(user.streak_current or 0))
    user.streak_last_local_date = local_today
    return True


async def assert_register_payload(
    *,
    first_name: str,
    last_name: str,
    nickname: str,
    email: str,
    password: str,
    gender: str,
    birth_date_raw: str,
):
    if not first_name or not last_name or not nickname or not email or not password or not gender or not birth_date_raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fill all required fields")

    if gender not in {"male", "female"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid gender")

    try:
        birth_date = datetime.strptime(birth_date_raw, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid birth date") from exc

    ok, message = validate_password(password)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    return birth_date


async def assert_unique_email_and_nickname(db, email: str, nickname: str, *, exclude_user_id: int | None = None) -> None:
    if await crud.get_user_by_email(db, email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email already registered")

    existing = await crud.get_user_by_nickname(db, nickname, exclude_user_id=exclude_user_id)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="nickname already taken")


def assert_password_or_raise(password: str, password_hash: str) -> None:
    try:
        valid = verify_password(password, password_hash)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid email or password")
