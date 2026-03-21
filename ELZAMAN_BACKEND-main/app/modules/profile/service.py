from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import pwd_context
from app.db.models import User
from app.modules.auth import crud as auth_crud
from app.modules.subscriptions.service import is_premium_user
from app.modules.xp.service import LEVEL_THRESHOLDS, build_progress_payload
from app.utils.datetime import to_iso_optional as _to_iso

TIMEZONE_CHANGE_COOLDOWN = timedelta(days=7)
DELETE_WINDOW_DAYS = 30


def _deletion_status(user: User) -> str:
    if user.deleted_at:
        return "deleted"
    if user.delete_requested_at:
        return "pending_delete"
    return "active"


def _is_pending_delete(user: User) -> bool:
    return _deletion_status(user) == "pending_delete"


async def build_profile_payload(db: AsyncSession, user: User) -> dict:
    experience = int(user.experience or 0)

    progress = build_progress_payload(experience)
    current_level = progress["level"]
    prev_threshold = LEVEL_THRESHOLDS[current_level - 1] if current_level >= 1 else 0
    next_threshold = progress["next_level_threshold"]
    level_span = next_threshold - prev_threshold
    level_progress_xp = max(0, experience - prev_threshold)
    level_need_xp = level_span if level_span > 0 else 1
    progress_percent = min(100, int(round(level_progress_xp / level_need_xp * 100)))

    return {
        "id": user.id,
        "email": user.email,
        "created_at": _to_iso(user.created_at),
        "role": user.role,
        "nickname": user.nickname,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "gender": user.gender,
        "birth_date": str(user.birth_date) if user.birth_date else None,
        "level": current_level,
        "experience": experience,
        "level_progress_xp": level_progress_xp,
        "level_need_xp": level_need_xp,
        "progress_percent": progress_percent,
        "is_premium": await is_premium_user(db, user.id),
        "timezone": user.timezone or "UTC",
        "timezone_changed_at": _to_iso(user.timezone_changed_at),
        "streak_current": int(user.streak_current or 0),
        "streak_best": int(user.streak_best or 0),
        "streak_last_local_date": str(user.streak_last_local_date) if user.streak_last_local_date else None,
        "deletion_status": _deletion_status(user),
        "delete_effective_at": _to_iso(user.delete_effective_at),
    }


async def update_nickname(db: AsyncSession, user: User, nickname: str) -> None:
    nickname = nickname.strip()
    if not nickname:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="nickname cannot be empty")

    existing = await auth_crud.get_user_by_nickname(db, nickname, exclude_user_id=user.id)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="nickname already taken")

    user.nickname = nickname


async def update_timezone(user: User, timezone_name: str) -> None:
    timezone_name = timezone_name.strip()
    if not timezone_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="timezone cannot be empty")

    try:
        ZoneInfo(timezone_name)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid timezone") from exc

    if timezone_name == (user.timezone or "UTC"):
        return

    now = datetime.utcnow()
    if user.timezone_changed_at and now - user.timezone_changed_at < TIMEZONE_CHANGE_COOLDOWN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="timezone can be changed only once every 7 days",
        )

    user.timezone = timezone_name
    user.timezone_changed_at = now


async def request_account_deletion(db: AsyncSession, user: User, password: str) -> None:
    password = password.strip()
    if not password or not pwd_context.verify(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid password")

    now = datetime.utcnow()
    if not _is_pending_delete(user):
        user.delete_requested_at = now
        user.delete_effective_at = now + timedelta(days=DELETE_WINDOW_DAYS)

    await auth_crud.delete_user_sessions(db, user.id)
    await auth_crud.revoke_all_refresh_sessions(db, user_id=user.id, now=now)
