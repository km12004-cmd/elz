import random
import secrets
from datetime import datetime
from math import ceil
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Song, TrackGame2Pair, UserGameAnswer, UserGameSession, UserTrackProgress
from app.modules.xp.service import XP_TASK_COMPLETED, award_xp, build_progress_payload
from app.utils.datetime import to_iso, utcnow
from app.utils.text import normalize_kyrgyz_text

PAIR_GAME_TYPE = "pairs"
MIN_EXERCISE_IDX = 2
MAX_PAIR_SIDE_LENGTH = 500
MAX_KG_TEXT_NORM_LENGTH = 500
PASS_RATIO = 0.8


def _build_kg_text_norm(value: str, *, exercise_idx: int) -> str:
    return f"e{exercise_idx}:{normalize_kyrgyz_text(value)}"


def _validate_exercise_idx(exercise_idx: int) -> int:
    normalized = int(exercise_idx)
    if normalized < MIN_EXERCISE_IDX:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="exercise must be >= 2")
    return normalized


def _normalize_pair_side(value: str, *, field_name: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} cannot be empty")
    if len(normalized) > MAX_PAIR_SIDE_LENGTH:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} is too long")
    return normalized


def _shuffle_options(pairs: list[TrackGame2Pair], *, seed: int) -> list[dict[str, object]]:
    options = [{"option_id": int(pair.id), "text": pair.ru_text} for pair in pairs]
    randomizer = random.Random(seed)
    randomizer.shuffle(options)
    return options


def _build_start_payload(session: UserGameSession, pairs: list[TrackGame2Pair]) -> dict[str, object]:
    items = [{"pair_id": int(pair.id), "left": pair.kg_text} for pair in pairs]
    options = _shuffle_options(pairs, seed=int(session.seed))
    return {
        "session_id": str(session.id),
        "track_id": int(session.track_id),
        "exercise": int(session.level),
        "items": items,
        "options": options,
    }


def _calc_passed(*, correct_count: int, total: int) -> bool:
    if total <= 0:
        return False
    threshold = max(1, ceil(total * PASS_RATIO))
    return correct_count >= threshold


async def _get_track_or_404(db: AsyncSession, track_id: int) -> Song:
    track = await db.get(Song, track_id)
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="track not found")
    return track


async def _list_track_pairs_rows(db: AsyncSession, *, track_id: int, exercise_idx: int) -> list[TrackGame2Pair]:
    result = await db.execute(
        select(TrackGame2Pair)
        .where(
            TrackGame2Pair.track_id == track_id,
            TrackGame2Pair.exercise_idx == exercise_idx,
        )
        .order_by(TrackGame2Pair.order_idx.asc(), TrackGame2Pair.id.asc())
    )
    return list(result.scalars().all())


async def _get_session_for_user_or_404(
    db: AsyncSession,
    *,
    user_id: int,
    session_id: str,
    with_lock: bool,
) -> UserGameSession:
    stmt = select(UserGameSession).where(
        UserGameSession.id == session_id,
        UserGameSession.user_id == user_id,
        UserGameSession.game_type == PAIR_GAME_TYPE,
    )
    if with_lock:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")
    return session


async def _upsert_user_answer(
    db: AsyncSession,
    *,
    session_id: str,
    pair_id: int,
    option_id: int,
    is_correct: bool,
    answered_at: datetime,
) -> None:
    values = {
        "session_id": session_id,
        "pair_id": int(pair_id),
        "chosen_option_id": int(option_id),
        "is_correct": bool(is_correct),
        "answered_at": answered_at,
    }
    dialect_name = db.get_bind().dialect.name

    try:
        if dialect_name == "postgresql":
            stmt = pg_insert(UserGameAnswer).values(values).on_conflict_do_update(
                index_elements=["session_id", "pair_id"],
                set_={
                    "chosen_option_id": int(option_id),
                    "is_correct": bool(is_correct),
                    "answered_at": answered_at,
                },
            )
            await db.execute(stmt)
            return

        if dialect_name == "sqlite":
            stmt = sqlite_insert(UserGameAnswer).values(values).on_conflict_do_update(
                index_elements=["session_id", "pair_id"],
                set_={
                    "chosen_option_id": int(option_id),
                    "is_correct": bool(is_correct),
                    "answered_at": answered_at,
                },
            )
            await db.execute(stmt)
            return
    except Exception:
        # Fallback protects compatibility with old DB states lacking upsert support.
        pass

    existing_result = await db.execute(
        select(UserGameAnswer)
        .where(
            UserGameAnswer.session_id == session_id,
            UserGameAnswer.pair_id == pair_id,
        )
        .with_for_update()
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        existing.chosen_option_id = int(option_id)
        existing.is_correct = bool(is_correct)
        existing.answered_at = answered_at
        await db.flush()
        return

    db.add(UserGameAnswer(**values))
    await db.flush()


async def list_game2_pairs_templates(
    db: AsyncSession,
    *,
    track_id: int,
    exercise_idx: int,
) -> list[dict[str, object]]:
    exercise_idx = _validate_exercise_idx(exercise_idx)
    await _get_track_or_404(db, track_id)
    pairs = await _list_track_pairs_rows(db, track_id=track_id, exercise_idx=exercise_idx)
    return [
        {
            "id": int(pair.id),
            "exercise": int(pair.exercise_idx),
            "kg_text": pair.kg_text,
            "ru_text": pair.ru_text,
            "order": int(pair.order_idx),
        }
        for pair in pairs
    ]


async def create_game2_pairs_templates(
    db: AsyncSession,
    *,
    track_id: int,
    exercise_idx: int,
    items: list[dict[str, object]],
) -> dict[str, object]:
    exercise_idx = _validate_exercise_idx(exercise_idx)
    await _get_track_or_404(db, track_id)
    now = utcnow()

    created_ids: list[int] = []
    for item in items:
        kg_text = _normalize_pair_side(str(item.get("kg_text", "")), field_name="kg_text")
        ru_text = _normalize_pair_side(str(item.get("ru_text", "")), field_name="ru_text")
        order = max(1, int(item.get("order", 1)))
        kg_text_norm = _build_kg_text_norm(kg_text, exercise_idx=exercise_idx)
        if kg_text_norm.endswith(":"):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="kg_text cannot be empty")
        if len(kg_text_norm) > MAX_KG_TEXT_NORM_LENGTH:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="kg_text is too long")

        row = TrackGame2Pair(
            track_id=track_id,
            exercise_idx=exercise_idx,
            kg_text=kg_text,
            kg_text_norm=kg_text_norm,
            ru_text=ru_text,
            order_idx=order,
            created_at=now,
        )
        db.add(row)
        try:
            await db.flush()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="pair template already exists") from exc
        created_ids.append(int(row.id))

    return {
        "track_id": int(track_id),
        "exercise": int(exercise_idx),
        "created_ids": created_ids,
        "created_count": len(created_ids),
    }


async def start_pairs_session(
    db: AsyncSession,
    *,
    user_id: int,
    track_id: int,
    exercise_idx: int,
) -> dict[str, object]:
    exercise_idx = _validate_exercise_idx(exercise_idx)
    await _get_track_or_404(db, track_id)
    now = utcnow()

    progress_result = await db.execute(
        select(UserTrackProgress)
        .where(
            UserTrackProgress.user_id == user_id,
            UserTrackProgress.track_id == track_id,
        )
        .with_for_update()
    )
    progress = progress_result.scalar_one_or_none()
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="exercise 1 must be started before pairs exercises",
        )

    current_unlocked = int(progress.unlocked_game or 1)
    if exercise_idx == MIN_EXERCISE_IDX:
        progress.unlocked_game = max(MIN_EXERCISE_IDX, current_unlocked)
    elif current_unlocked < exercise_idx:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"exercise {exercise_idx} is locked",
        )

    active_result = await db.execute(
        select(UserGameSession)
        .where(
            UserGameSession.user_id == user_id,
            UserGameSession.track_id == track_id,
            UserGameSession.game_type == PAIR_GAME_TYPE,
            UserGameSession.level == exercise_idx,
            UserGameSession.status == "in_progress",
        )
        .order_by(UserGameSession.started_at.desc())
        .limit(1)
        .with_for_update()
    )
    session = active_result.scalar_one_or_none()

    pairs = await _list_track_pairs_rows(db, track_id=track_id, exercise_idx=exercise_idx)
    if not pairs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"pair templates not found for exercise {exercise_idx}",
        )

    progress.updated_at = now

    if not session:
        session = UserGameSession(
            id=str(uuid4()),
            user_id=user_id,
            track_id=track_id,
            game_type=PAIR_GAME_TYPE,
            level=exercise_idx,
            status="in_progress",
            seed=secrets.randbelow(2_147_483_647),
            started_at=now,
            finished_at=None,
        )
        db.add(session)
        await db.flush()

    return _build_start_payload(session, pairs)


async def submit_pairs_answer(
    db: AsyncSession,
    *,
    user_id: int,
    session_id: str,
    pair_id: int,
    option_id: int,
) -> dict[str, object]:
    session = await _get_session_for_user_or_404(
        db,
        user_id=user_id,
        session_id=session_id,
        with_lock=True,
    )
    if session.status != "in_progress":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="session is not in progress")

    result = await db.execute(
        select(TrackGame2Pair).where(
            TrackGame2Pair.track_id == session.track_id,
            TrackGame2Pair.exercise_idx == session.level,
            TrackGame2Pair.id.in_([pair_id, option_id]),
        )
    )
    pair_map = {int(row.id): row for row in result.scalars().all()}

    if int(pair_id) not in pair_map:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pair not found")
    if int(option_id) not in pair_map:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="option not found")

    is_correct = int(pair_id) == int(option_id)
    now = utcnow()
    await _upsert_user_answer(
        db,
        session_id=str(session.id),
        pair_id=int(pair_id),
        option_id=int(option_id),
        is_correct=bool(is_correct),
        answered_at=now,
    )

    return {
        "pair_id": int(pair_id),
        "option_id": int(option_id),
        "correct": bool(is_correct),
    }


async def finish_pairs_session(db: AsyncSession, *, user_id: int, session_id: str) -> dict[str, object]:
    session = await _get_session_for_user_or_404(
        db,
        user_id=user_id,
        session_id=session_id,
        with_lock=True,
    )
    if session.status == "abandoned":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="session is abandoned")

    correct_result = await db.execute(
        select(func.count(UserGameAnswer.pair_id)).where(
            UserGameAnswer.session_id == session.id,
            UserGameAnswer.is_correct.is_(True),
        )
    )
    correct_count = int(correct_result.scalar_one() or 0)

    total_result = await db.execute(
        select(func.count(TrackGame2Pair.id)).where(
            TrackGame2Pair.track_id == session.track_id,
            TrackGame2Pair.exercise_idx == session.level,
        )
    )
    total = int(total_result.scalar_one() or 0)
    passed = _calc_passed(correct_count=correct_count, total=total)

    now = utcnow()
    session.status = "completed"
    if session.finished_at is None:
        session.finished_at = now

    progress_result = await db.execute(
        select(UserTrackProgress)
        .where(
            UserTrackProgress.user_id == user_id,
            UserTrackProgress.track_id == session.track_id,
        )
        .with_for_update()
    )
    progress = progress_result.scalar_one_or_none()
    if progress:
        progress.unlocked_game = max(MIN_EXERCISE_IDX, int(progress.unlocked_game or 1))
        if passed:
            progress.unlocked_game = max(int(session.level) + 1, int(progress.unlocked_game or 1))
            if int(session.level) >= 3:
                progress.status = "finished"
        progress.updated_at = now

    xp_result = {"applied": False, "xp_delta": 0, "new_xp": None, "new_level": None}
    if passed:
        dedupe_key = f"task_completed:{session.track_id}:{session.level}"
        xp_result = await award_xp(
            db,
            user_id=user_id,
            event_type="task_completed",
            source_id=f"{session.track_id}:{session.level}",
            dedupe_key=dedupe_key,
            xp_delta=XP_TASK_COMPLETED,
        )

    progress_fields: dict = {}
    if xp_result["applied"] and xp_result["new_xp"] is not None:
        progress_fields = build_progress_payload(xp_result["new_xp"])

    return {
        "exercise": int(session.level),
        "correct": correct_count,
        "total": total,
        "passed": passed,
        "xp_applied": xp_result["applied"],
        "xp_delta": xp_result["xp_delta"],
        "new_xp": xp_result["new_xp"],
        "new_level": xp_result["new_level"],
        "next_level_threshold": progress_fields.get("next_level_threshold"),
        "xp_to_next_level": progress_fields.get("xp_to_next_level"),
    }


async def get_pairs_session_status(db: AsyncSession, *, user_id: int, session_id: str) -> dict[str, object]:
    session = await _get_session_for_user_or_404(
        db,
        user_id=user_id,
        session_id=session_id,
        with_lock=False,
    )

    answers_result = await db.execute(
        select(UserGameAnswer)
        .where(UserGameAnswer.session_id == session.id)
        .order_by(UserGameAnswer.answered_at.asc(), UserGameAnswer.pair_id.asc())
    )
    answers = list(answers_result.scalars().all())

    total_result = await db.execute(
        select(func.count(TrackGame2Pair.id)).where(
            TrackGame2Pair.track_id == session.track_id,
            TrackGame2Pair.exercise_idx == session.level,
        )
    )
    total = int(total_result.scalar_one() or 0)
    answered_count = len(answers)

    return {
        "session_id": str(session.id),
        "track_id": int(session.track_id),
        "exercise": int(session.level),
        "status": str(session.status),
        "answered_count": answered_count,
        "total": total,
        "remaining": max(0, total - answered_count),
        "answers": [
            {
                "pair_id": int(answer.pair_id),
                "option_id": int(answer.chosen_option_id),
                "correct": bool(answer.is_correct),
                "answered_at": to_iso(answer.answered_at),
            }
            for answer in answers
        ],
    }


async def delete_game2_pairs_templates(
    db: AsyncSession,
    *,
    track_id: int,
    exercise_idx: int,
) -> dict[str, object]:
    exercise_idx = _validate_exercise_idx(exercise_idx)
    await _get_track_or_404(db, track_id)
    result = await db.execute(
        delete(TrackGame2Pair).where(
            TrackGame2Pair.track_id == track_id,
            TrackGame2Pair.exercise_idx == exercise_idx,
        )
    )
    await db.flush()
    return {
        "track_id": int(track_id),
        "exercise": int(exercise_idx),
        "deleted_count": int(result.rowcount or 0),
    }
