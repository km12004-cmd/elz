from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Flashcard,
    FlashcardFolder,
    Song,
    TrackFlashcardTemplate,
    UserTrackFlashcardFolder,
    UserTrackProgress,
)
from app.utils.datetime import utcnow
from app.utils.text import normalize_kyrgyz_text

LEARNING_STATUSES = {"listened", "learning", "finished"}
LISTENED_THRESHOLD_PERCENT = 90
MAX_FOLDER_TITLE_LENGTH = 60
MAX_TEMPLATE_SIDE_LENGTH = 500


def _normalize_template_side(value: str, *, field_name: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} cannot be empty")
    if len(normalized) > MAX_TEMPLATE_SIDE_LENGTH:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} is too long")
    return normalized


def _build_folder_title(track_title: str) -> str:
    suffix = " - Flashcards"
    base = (track_title or "").strip() or "Track"
    title = f"{base}{suffix}"
    if len(title) <= MAX_FOLDER_TITLE_LENGTH:
        return title
    trimmed = title[:MAX_FOLDER_TITLE_LENGTH].strip()
    return trimmed or "Track Flashcards"


async def _get_track_or_404(db: AsyncSession, track_id: int) -> Song:
    track = await db.get(Song, track_id)
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="track not found")
    return track


async def _get_or_create_progress_for_learning(
    db: AsyncSession,
    *,
    user_id: int,
    track_id: int,
    now: datetime,
) -> UserTrackProgress:
    result = await db.execute(
        select(UserTrackProgress)
        .where(
            UserTrackProgress.user_id == user_id,
            UserTrackProgress.track_id == track_id,
        )
        .with_for_update()
    )
    progress = result.scalar_one_or_none()
    if not progress:
        progress = UserTrackProgress(
            user_id=user_id,
            track_id=track_id,
            status="learning",
            unlocked_level=1,
            unlocked_game=1,
            started_learning_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(progress)
        await db.flush()
        return progress

    progress.status = "learning"
    progress.unlocked_level = max(1, int(progress.unlocked_level or 1))
    progress.unlocked_game = max(1, int(progress.unlocked_game or 1))
    if progress.started_learning_at is None:
        progress.started_learning_at = now
    progress.updated_at = now
    await db.flush()
    return progress


async def _get_or_create_track_folder(
    db: AsyncSession,
    *,
    user_id: int,
    track_id: int,
    track_title: str,
    now: datetime,
) -> int:
    result = await db.execute(
        select(UserTrackFlashcardFolder)
        .where(
            UserTrackFlashcardFolder.user_id == user_id,
            UserTrackFlashcardFolder.track_id == track_id,
        )
        .with_for_update()
    )
    link = result.scalar_one_or_none()

    if link:
        existing_folder = await db.get(FlashcardFolder, int(link.folder_id))
        if existing_folder and int(existing_folder.user_id) == int(user_id):
            return int(existing_folder.id)

    base_title = _build_folder_title(track_title)
    title = base_title
    suffix_idx = 2
    while True:
        folder_result = await db.execute(
            select(FlashcardFolder.id).where(
                FlashcardFolder.user_id == user_id,
                FlashcardFolder.title == title,
            )
        )
        existing_folder_id = folder_result.scalar_one_or_none()
        if existing_folder_id is None:
            break

        suffix = f" ({suffix_idx})"
        trimmed_base = base_title[: max(1, MAX_FOLDER_TITLE_LENGTH - len(suffix))].rstrip()
        title = f"{trimmed_base}{suffix}"
        suffix_idx += 1

    folder = FlashcardFolder(
        user_id=user_id,
        title=title,
        created_at=now,
        updated_at=now,
    )
    db.add(folder)
    await db.flush()

    if link:
        link.folder_id = int(folder.id)
    else:
        db.add(
            UserTrackFlashcardFolder(
                user_id=user_id,
                track_id=track_id,
                folder_id=int(folder.id),
                created_at=now,
            )
        )
    await db.flush()
    return int(folder.id)


async def _copy_templates_to_folder(
    db: AsyncSession,
    *,
    user_id: int,
    track_id: int,
    folder_id: int,
    max_level: int,
    now: datetime,
) -> tuple[int, int]:
    result = await db.execute(
        select(TrackFlashcardTemplate)
        .where(
            TrackFlashcardTemplate.track_id == track_id,
            TrackFlashcardTemplate.level_idx <= max(1, int(max_level)),
        )
        .order_by(
            TrackFlashcardTemplate.level_idx.asc(),
            TrackFlashcardTemplate.order_idx.asc(),
            TrackFlashcardTemplate.id.asc(),
        )
    )
    templates = result.scalars().all()
    if not templates:
        return 0, 0

    deduped: dict[str, tuple[str, str]] = {}
    for template in templates:
        front = (template.kg_text or "").strip()
        back = (template.ru_text or "").strip()
        if not front or not back:
            continue
        front_norm = normalize_kyrgyz_text(front)
        if not front_norm or front_norm in deduped:
            continue
        deduped[front_norm] = (front, back)

    values = [
        {
            "source_type": "folder",
            "prompt_text": front,
            "answer_text": back,
            "folder_id": folder_id,
            "user_id": user_id,
            "prompt_text_norm": front_norm,
            "created_at": now,
            "updated_at": now,
        }
        for front_norm, (front, back) in deduped.items()
    ]
    total_cards = len(values)
    if total_cards == 0:
        return 0, 0

    dialect_name = db.get_bind().dialect.name
    try:
        if dialect_name == "postgresql":
            stmt = (
                pg_insert(Flashcard)
                .values(values)
                .on_conflict_do_nothing(index_elements=["folder_id", "prompt_text_norm"])
                .returning(Flashcard.id)
            )
            added = len((await db.execute(stmt)).scalars().all())
            return added, total_cards - added

        if dialect_name == "sqlite":
            stmt = sqlite_insert(Flashcard).values(values).on_conflict_do_nothing(
                index_elements=["folder_id", "prompt_text_norm"]
            )
            result = await db.execute(stmt)
            added = int(result.rowcount or 0)
            if added < 0:
                added = 0
            return added, total_cards - added
    except Exception:
        # Fallback path is used when DB has not yet created the unique index
        # (for example, during staged rollouts with legacy data).
        pass

    existing_result = await db.execute(
        select(Flashcard.prompt_text_norm).where(
            Flashcard.folder_id == folder_id,
            Flashcard.user_id == user_id,
            Flashcard.source_type == "folder",
            Flashcard.prompt_text_norm.in_(list(deduped.keys())),
        )
    )
    existing_norms = {str(row[0]) for row in existing_result.all() if row[0]}
    added = 0
    for value in values:
        front_norm = str(value["prompt_text_norm"])
        if front_norm in existing_norms:
            continue
        db.add(Flashcard(**value))
        existing_norms.add(front_norm)
        added += 1
    await db.flush()
    return added, total_cards - added


async def start_learning(db: AsyncSession, *, user_id: int, track_id: int) -> dict[str, int]:
    track = await _get_track_or_404(db, track_id)
    now = utcnow()

    progress = await _get_or_create_progress_for_learning(
        db,
        user_id=user_id,
        track_id=track_id,
        now=now,
    )
    folder_id = await _get_or_create_track_folder(
        db,
        user_id=user_id,
        track_id=track_id,
        track_title=track.title,
        now=now,
    )
    cards_added, cards_existing = await _copy_templates_to_folder(
        db,
        user_id=user_id,
        track_id=track_id,
        folder_id=folder_id,
        max_level=int(progress.unlocked_level or 1),
        now=now,
    )

    return {
        "track_id": int(track_id),
        "unlocked_level": int(progress.unlocked_level or 1),
        "unlocked_game": int(progress.unlocked_game or 1),
        "folder_id": int(folder_id),
        "cards_added": int(cards_added),
        "cards_existing": int(cards_existing),
    }


async def get_learning_state(db: AsyncSession, *, user_id: int, track_id: int) -> dict[str, object]:
    await _get_track_or_404(db, track_id)
    progress_result = await db.execute(
        select(UserTrackProgress).where(
            UserTrackProgress.user_id == user_id,
            UserTrackProgress.track_id == track_id,
        )
    )
    progress = progress_result.scalar_one_or_none()
    link_result = await db.execute(
        select(UserTrackFlashcardFolder).where(
            UserTrackFlashcardFolder.user_id == user_id,
            UserTrackFlashcardFolder.track_id == track_id,
        )
    )
    link = link_result.scalar_one_or_none()

    folder_id: int | None = None
    if link:
        folder = await db.get(FlashcardFolder, int(link.folder_id))
        if folder and int(folder.user_id) == int(user_id):
            folder_id = int(folder.id)

    if not progress:
        return {
            "status": "not_started",
            "unlocked_level": 0,
            "unlocked_game": 0,
            "folder_id": folder_id,
        }

    status_value = (progress.status or "learning").strip().lower()
    if status_value not in LEARNING_STATUSES:
        status_value = "learning"

    return {
        "status": status_value,
        "unlocked_level": max(1, int(progress.unlocked_level or 1)),
        "unlocked_game": max(1, int(progress.unlocked_game or 1)),
        "folder_id": folder_id,
    }


async def list_flashcard_templates(
    db: AsyncSession,
    *,
    track_id: int,
    level: int | None = None,
) -> list[dict[str, object]]:
    await _get_track_or_404(db, track_id)
    stmt = select(TrackFlashcardTemplate).where(TrackFlashcardTemplate.track_id == track_id)
    if level is not None:
        stmt = stmt.where(TrackFlashcardTemplate.level_idx == max(1, int(level)))
    stmt = stmt.order_by(
        TrackFlashcardTemplate.level_idx.asc(),
        TrackFlashcardTemplate.order_idx.asc(),
        TrackFlashcardTemplate.id.asc(),
    )
    result = await db.execute(stmt)
    return [
        {
            "id": int(row.id),
            "level": int(row.level_idx),
            "kg_text": row.kg_text,
            "ru_text": row.ru_text,
            "order": int(row.order_idx),
        }
        for row in result.scalars().all()
    ]


async def create_flashcard_templates(
    db: AsyncSession,
    *,
    track_id: int,
    items: list[dict[str, object]],
) -> dict[str, object]:
    await _get_track_or_404(db, track_id)
    now = utcnow()

    created_ids: list[int] = []
    for item in items:
        kg_text = _normalize_template_side(str(item.get("kg_text", "")), field_name="kg_text")
        ru_text = _normalize_template_side(str(item.get("ru_text", "")), field_name="ru_text")
        order = max(1, int(item.get("order", 1)))
        level = max(1, int(item.get("level", 1)))

        template = TrackFlashcardTemplate(
            track_id=track_id,
            level_idx=level,
            kg_text=kg_text,
            ru_text=ru_text,
            order_idx=order,
            created_at=now,
        )
        db.add(template)
        try:
            await db.flush()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="template already exists") from exc
        created_ids.append(int(template.id))

    return {
        "track_id": int(track_id),
        "created_ids": created_ids,
        "created_count": len(created_ids),
    }


async def list_track_level_cards(
    db: AsyncSession,
    *,
    track_id: int,
    level: int,
) -> dict[str, object]:
    normalized_level = max(1, int(level))
    items = await list_flashcard_templates(db, track_id=track_id, level=normalized_level)
    return {
        "track_id": int(track_id),
        "level": normalized_level,
        "items": items,
    }


async def mark_listened(
    db: AsyncSession,
    *,
    user_id: int,
    track_id: int,
    percent: int | None,
    seconds_listened: int | None,
) -> dict[str, object]:
    track = await _get_track_or_404(db, track_id)
    now = utcnow()

    reaches_threshold = False
    if percent is not None and int(percent) >= LISTENED_THRESHOLD_PERCENT:
        reaches_threshold = True
    if seconds_listened is not None and int(seconds_listened) > 0:
        if track.duration_seconds and int(track.duration_seconds) > 0:
            target_seconds = int(track.duration_seconds * 0.9)
            if int(seconds_listened) >= target_seconds:
                reaches_threshold = True
        elif percent is None:
            reaches_threshold = True

    result = await db.execute(
        select(UserTrackProgress)
        .where(
            UserTrackProgress.user_id == user_id,
            UserTrackProgress.track_id == track_id,
        )
        .with_for_update()
    )
    progress = result.scalar_one_or_none()
    if not progress:
        progress = UserTrackProgress(
            user_id=user_id,
            track_id=track_id,
            status="listened" if reaches_threshold else "learning",
            unlocked_level=1,
            unlocked_game=1,
            started_learning_at=None if reaches_threshold else now,
            last_listened_at=now if reaches_threshold else None,
            created_at=now,
            updated_at=now,
        )
        db.add(progress)
    else:
        progress.unlocked_level = max(1, int(progress.unlocked_level or 1))
        progress.unlocked_game = max(1, int(progress.unlocked_game or 1))
        if reaches_threshold and progress.status != "finished":
            progress.status = "listened"
            progress.last_listened_at = now
        progress.updated_at = now
    await db.flush()

    link_result = await db.execute(
        select(UserTrackFlashcardFolder).where(
            UserTrackFlashcardFolder.user_id == user_id,
            UserTrackFlashcardFolder.track_id == track_id,
        )
    )
    link = link_result.scalar_one_or_none()
    folder_id: int | None = None
    if link:
        folder = await db.get(FlashcardFolder, int(link.folder_id))
        if folder and int(folder.user_id) == int(user_id):
            folder_id = int(folder.id)

    status_value = (progress.status or "learning").strip().lower()
    if status_value not in LEARNING_STATUSES:
        status_value = "learning"

    return {
        "track_id": int(track_id),
        "status": status_value,
        "unlocked_level": int(progress.unlocked_level or 1),
        "unlocked_game": int(progress.unlocked_game or 1),
        "folder_id": folder_id,
    }


async def delete_flashcard_templates(
    db: AsyncSession,
    *,
    track_id: int,
) -> dict[str, object]:
    await _get_track_or_404(db, track_id)
    result = await db.execute(
        delete(TrackFlashcardTemplate).where(
            TrackFlashcardTemplate.track_id == track_id,
        )
    )
    await db.flush()
    return {
        "track_id": int(track_id),
        "deleted_count": int(result.rowcount or 0),
    }


async def delete_track_level_cards(
    db: AsyncSession,
    *,
    track_id: int,
    level: int,
) -> dict[str, object]:
    if level < 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="level must be >= 1")
    await _get_track_or_404(db, track_id)
    result = await db.execute(
        delete(TrackFlashcardTemplate).where(
            TrackFlashcardTemplate.track_id == track_id,
            TrackFlashcardTemplate.level_idx == level,
        )
    )
    await db.flush()
    return {
        "track_id": int(track_id),
        "deleted_count": int(result.rowcount or 0),
    }
