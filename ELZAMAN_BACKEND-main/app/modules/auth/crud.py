from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RefreshSession, Session, User


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_nickname(db: AsyncSession, nickname: str, *, exclude_user_id: int | None = None) -> User | None:
    stmt = select(User).where(User.nickname == nickname)
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    *,
    first_name: str,
    last_name: str,
    nickname: str,
    email: str,
    password_hash: str,
    locale: str,
    gender: str,
    birth_date,
) -> User:
    user = User(
        first_name=first_name,
        last_name=last_name,
        nickname=nickname,
        email=email,
        password_hash=password_hash,
        locale=locale,
        gender=gender,
        birth_date=birth_date,
    )
    db.add(user)
    await db.flush()
    return user


async def create_session(db: AsyncSession, session_id: str, user_id: int, expires_at: datetime) -> None:
    db.add(Session(id=session_id, user_id=user_id, expires_at=expires_at))


async def delete_session(db: AsyncSession, session_id: str) -> None:
    await db.execute(delete(Session).where(Session.id == session_id))


async def delete_user_sessions(db: AsyncSession, user_id: int) -> None:
    await db.execute(delete(Session).where(Session.user_id == user_id))


async def get_session(db: AsyncSession, session_id: str) -> Session | None:
    result = await db.execute(select(Session).where(Session.id == session_id))
    return result.scalar_one_or_none()


async def create_refresh_session(
    db: AsyncSession,
    *,
    refresh_id: str,
    user_id: int,
    expires_at: datetime,
    rotated_from: str | None = None,
) -> None:
    db.add(
        RefreshSession(
            jti=refresh_id,
            user_id=user_id,
            expires_at=expires_at,
            rotated_from=rotated_from,
        )
    )


async def revoke_refresh_session(
    db: AsyncSession,
    *,
    user_id: int,
    refresh_id: str,
    now: datetime,
    require_unexpired: bool = False,
) -> bool:
    conditions = [
        RefreshSession.jti == refresh_id,
        RefreshSession.user_id == user_id,
        RefreshSession.revoked_at.is_(None),
    ]
    if require_unexpired:
        conditions.append(RefreshSession.expires_at > now)

    stmt = (
        update(RefreshSession)
        .where(*conditions)
        .values(revoked_at=now, last_used_at=now)
        .returning(RefreshSession.jti)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def revoke_all_refresh_sessions(db: AsyncSession, *, user_id: int, now: datetime) -> None:
    await db.execute(
        update(RefreshSession)
        .where(
            RefreshSession.user_id == user_id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=now, last_used_at=now)
    )
