import bisect
from datetime import timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Song, SongPageSession, User, XpEvent
from app.utils.datetime import utcnow

XP_SONG_COMPLETED = 100
XP_TASK_COMPLETED = 50
MIN_SECONDS_ON_PAGE = 30

# LEVEL_THRESHOLDS[i] = minimum cumulative XP required to reach level (i+1).
# Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 250 XP, etc.
LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 1750, 2750, 4000, 5500, 7500, 10000]


def level_from_xp(xp: int) -> int:
    """Return the 1-based level for a given total XP amount."""
    return bisect.bisect_right(LEVEL_THRESHOLDS, xp)


def build_progress_payload(experience: int) -> dict:
    current_level = level_from_xp(experience)
    max_level = len(LEVEL_THRESHOLDS)
    if current_level < max_level:
        next_level = current_level + 1
        next_threshold = LEVEL_THRESHOLDS[current_level]  # index = next level - 1
        xp_to_next = max(0, next_threshold - experience)
    else:
        next_level = current_level
        next_threshold = LEVEL_THRESHOLDS[-1]
        xp_to_next = 0
    return {
        "level": current_level,
        "xp_total": experience,
        "next_level": next_level,
        "next_level_threshold": next_threshold,
        "xp_to_next_level": xp_to_next,
    }


async def award_xp(
    db: AsyncSession,
    *,
    user_id: int,
    event_type: str,
    source_id: str,
    dedupe_key: str,
    xp_delta: int,
) -> dict:
    """
    Idempotently award XP to a user.

    Uses a DB-level UNIQUE(user_id, dedupe_key) constraint to enforce
    the one-award-per-entity rule. The INSERT is wrapped in a savepoint
    so a duplicate does not roll back the caller's transaction.

    Returns {"applied": True/False, ...}. Caller is responsible for commit.
    """
    try:
        async with db.begin_nested():
            event = XpEvent(
                user_id=user_id,
                event_type=event_type,
                source_id=source_id,
                dedupe_key=dedupe_key,
                xp_delta=xp_delta,
                created_at=utcnow(),
            )
            db.add(event)
            await db.flush()
    except IntegrityError:
        return {"applied": False, "reason": "duplicate", "xp_delta": 0, "new_xp": None, "new_level": None}

    # Atomically increment experience
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(experience=User.experience + xp_delta)
    )
    await db.flush()

    # Re-fetch to get the committed value within this transaction
    result = await db.execute(select(User.experience).where(User.id == user_id))
    new_xp = int(result.scalar_one())
    new_level = level_from_xp(new_xp)

    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(level=new_level)
    )

    return {
        "applied": True,
        "reason": None,
        "xp_delta": xp_delta,
        "new_xp": new_xp,
        "new_level": new_level,
    }


async def open_song_page(db: AsyncSession, *, user_id: int, song_id: int) -> str:
    """Record (or refresh) the timestamp when a user opens a song page."""
    song = await db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="song not found")

    session_id = str(uuid4())
    now = utcnow()
    values = {
        "user_id": user_id,
        "song_id": song_id,
        "opened_at": now,
        "session_id": session_id,
    }

    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        stmt = pg_insert(SongPageSession).values(values).on_conflict_do_update(
            index_elements=["user_id", "song_id"],
            set_={"opened_at": now, "session_id": session_id},
        )
        await db.execute(stmt)
    elif dialect == "sqlite":
        stmt = sqlite_insert(SongPageSession).values(values).on_conflict_do_update(
            index_elements=["user_id", "song_id"],
            set_={"opened_at": now, "session_id": session_id},
        )
        await db.execute(stmt)
    else:
        existing_result = await db.execute(
            select(SongPageSession).where(
                SongPageSession.user_id == user_id,
                SongPageSession.song_id == song_id,
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            existing.opened_at = now
            existing.session_id = session_id
        else:
            db.add(SongPageSession(**values))
        await db.flush()

    return session_id


async def complete_song(db: AsyncSession, *, user_id: int, song_id: int) -> dict:
    """
    Award XP for completing a song.

    Requires the user to have previously called open_song_page and waited
    at least MIN_SECONDS_ON_PAGE seconds.
    """
    result = await db.execute(
        select(SongPageSession).where(
            SongPageSession.user_id == user_id,
            SongPageSession.song_id == song_id,
        )
    )
    page_session = result.scalar_one_or_none()
    if not page_session:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="song not opened")

    opened_at = page_session.opened_at
    if opened_at.tzinfo is None:
        opened_at = opened_at.replace(tzinfo=timezone.utc)
    elapsed = (utcnow() - opened_at).total_seconds()
    if elapsed < MIN_SECONDS_ON_PAGE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"too soon: {int(MIN_SECONDS_ON_PAGE - elapsed)}s remaining",
        )

    award = await award_xp(
        db,
        user_id=user_id,
        event_type="song_completed",
        source_id=str(song_id),
        dedupe_key=f"song_completed:{song_id}",
        xp_delta=XP_SONG_COMPLETED,
    )
    progress_fields: dict = {}
    if award["applied"] and award["new_xp"] is not None:
        progress_fields = build_progress_payload(award["new_xp"])
    return {
        "song_id": song_id,
        **award,
        "next_level_threshold": progress_fields.get("next_level_threshold"),
        "xp_to_next_level": progress_fields.get("xp_to_next_level"),
    }
