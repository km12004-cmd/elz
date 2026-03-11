from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, UserSubscription
from app.modules.subscriptions.service import is_premium_user
from app.modules.xp.service import level_from_xp
from app.utils.datetime import to_iso_optional

VALID_ROLES = {"user", "admin"}


async def _get_user_or_404(db: AsyncSession, user_id: int) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    return user


async def _get_premium_user_ids(db: AsyncSession, user_ids: list[int]) -> set[int]:
    if not user_ids:
        return set()
    result = await db.execute(
        select(UserSubscription.user_id).where(
            UserSubscription.user_id.in_(user_ids),
            UserSubscription.status == "active",
            UserSubscription.starts_at <= func.now(),
            UserSubscription.expires_at > func.now(),
        )
    )
    return {row[0] for row in result.all()}


def _serialize_user(user: User, is_premium: bool) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "nickname": user.nickname,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
        "level": int(user.level or 1),
        "experience": int(user.experience or 0),
        "is_premium": is_premium,
        "created_at": to_iso_optional(user.created_at) or "",
        "deleted_at": to_iso_optional(user.deleted_at),
        "delete_requested_at": to_iso_optional(user.delete_requested_at),
    }


async def list_users(
    db: AsyncSession,
    *,
    limit: int,
    offset: int,
    query: str | None = None,
) -> tuple[int, list[dict]]:
    search = (query or "").strip()
    base = select(User).where(User.deleted_at.is_(None))

    if search:
        like = f"%{search}%"
        base = base.where(
            or_(
                User.email.ilike(like),
                User.nickname.ilike(like),
                User.first_name.ilike(like),
                User.last_name.ilike(like),
            )
        )

    count_stmt = select(func.count()).select_from(base.subquery())
    rows_stmt = base.order_by(User.created_at.desc(), User.id.desc()).limit(limit).offset(offset)

    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    users = (await db.execute(rows_stmt)).scalars().all()

    premium_ids = await _get_premium_user_ids(db, [u.id for u in users])
    items = [_serialize_user(u, u.id in premium_ids) for u in users]
    return total, items


async def get_user_detail(db: AsyncSession, user_id: int) -> dict:
    user = await _get_user_or_404(db, user_id)
    premium = await is_premium_user(db, user.id)
    return _serialize_user(user, premium)


async def assign_role(db: AsyncSession, user_id: int, role: str) -> dict:
    if role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid role; must be one of: {sorted(VALID_ROLES)}",
        )
    user = await _get_user_or_404(db, user_id)
    user.role = role
    await db.flush()
    premium = await is_premium_user(db, user.id)
    return _serialize_user(user, premium)


async def grant_premium(
    db: AsyncSession,
    user_id: int,
    *,
    days: int,
    plan_code: str,
) -> None:
    if days < 1 or days > 3650:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="days must be between 1 and 3650",
        )
    await _get_user_or_404(db, user_id)

    now = datetime.utcnow()
    subscription = UserSubscription(
        user_id=user_id,
        plan_code=plan_code,
        status="active",
        starts_at=now,
        expires_at=now + timedelta(days=days),
        provider="admin",
    )
    db.add(subscription)
    await db.flush()


async def revoke_premium(db: AsyncSession, user_id: int) -> None:
    await _get_user_or_404(db, user_id)

    now = datetime.utcnow()
    result = await db.execute(
        select(UserSubscription).where(
            UserSubscription.user_id == user_id,
            UserSubscription.status == "active",
            UserSubscription.expires_at > now,
        )
    )
    active_subs = result.scalars().all()
    if not active_subs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="no active subscription found for this user",
        )

    for sub in active_subs:
        sub.status = "revoked"
        sub.expires_at = now
        sub.updated_at = now
    await db.flush()


async def set_user_xp(db: AsyncSession, user_id: int, experience: int) -> dict:
    if experience < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="experience must be >= 0",
        )
    user = await _get_user_or_404(db, user_id)
    new_level = level_from_xp(experience)
    user.experience = experience
    user.level = new_level
    await db.flush()
    return {"user_id": user_id, "experience": experience, "level": new_level}
