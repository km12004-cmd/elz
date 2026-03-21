from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Flashcard, UserFlashcardState
from app.utils.datetime import to_iso, utcnow
from app.utils.text import normalize_kyrgyz_text

from . import crud

INTERVAL_DAYS = {
    1: 1,
    2: 3,
    3: 7,
    4: 14,
    5: 30,
}
MAX_STAGE = 5
REVIEWABLE_SOURCE_TYPES = {"curated", "auto"}
MAX_FOLDER_TITLE_LENGTH = 60
MAX_CARD_SIDE_LENGTH = 500


def _normalize_text(value: str, *, field_name: str, max_length: int) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} cannot be empty",
        )
    if len(normalized) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} is too long",
        )
    return normalized


async def _seed_missing_curated_states(db: AsyncSession, user_id: int) -> None:
    cards_result = await db.execute(select(Flashcard.id).where(Flashcard.source_type == "curated"))
    card_ids = [row[0] for row in cards_result.all()]
    if not card_ids:
        return

    states_result = await db.execute(
        select(UserFlashcardState.flashcard_id).where(
            UserFlashcardState.user_id == user_id,
            UserFlashcardState.flashcard_id.in_(card_ids),
        )
    )
    existing = {row[0] for row in states_result.all()}
    now = datetime.utcnow()
    for card_id in card_ids:
        if card_id in existing:
            continue
        db.add(
            UserFlashcardState(
                user_id=user_id,
                flashcard_id=card_id,
                stage=1,
                next_due_at=now,
            )
        )


async def get_due_flashcards(db: AsyncSession, user_id: int, limit: int = 20) -> list[dict]:
    await _seed_missing_curated_states(db, user_id)
    await db.flush()

    result = await db.execute(
        select(UserFlashcardState, Flashcard)
        .join(Flashcard, Flashcard.id == UserFlashcardState.flashcard_id)
        .where(
            UserFlashcardState.user_id == user_id,
            UserFlashcardState.next_due_at <= datetime.utcnow(),
            Flashcard.source_type.in_(tuple(REVIEWABLE_SOURCE_TYPES)),
        )
        .order_by(UserFlashcardState.next_due_at, UserFlashcardState.flashcard_id)
        .limit(limit)
    )
    items = []
    for state_row, card in result.all():
        items.append(
            {
                "flashcard_id": card.id,
                "prompt_text": card.prompt_text,
                "answer_text": card.answer_text,
                "source_type": card.source_type,
                "stage": int(state_row.stage),
                "next_due_at": to_iso(state_row.next_due_at),
            }
        )
    return items


async def review_flashcard(db: AsyncSession, *, user_id: int, flashcard_id: int, correct: bool) -> dict:
    card = await db.get(Flashcard, flashcard_id)
    if not card or card.source_type not in REVIEWABLE_SOURCE_TYPES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    result = await db.execute(
        select(UserFlashcardState)
        .where(
            and_(
                UserFlashcardState.user_id == user_id,
                UserFlashcardState.flashcard_id == flashcard_id,
            )
        )
        .with_for_update()
    )
    state_row = result.scalar_one_or_none()
    now = datetime.utcnow()
    if not state_row:
        state_row = UserFlashcardState(
            user_id=user_id,
            flashcard_id=flashcard_id,
            stage=1,
            next_due_at=now,
        )
        db.add(state_row)
        await db.flush()

    if correct:
        new_stage = min(MAX_STAGE, int(state_row.stage or 1) + 1)
        wait_days = INTERVAL_DAYS.get(new_stage, INTERVAL_DAYS[MAX_STAGE])
        next_due_at = now + timedelta(days=wait_days)
    else:
        new_stage = 1
        next_due_at = now + timedelta(days=INTERVAL_DAYS[1])

    state_row.stage = new_stage
    state_row.next_due_at = next_due_at
    state_row.last_reviewed_at = now

    return {
        "flashcard_id": flashcard_id,
        "stage": new_stage,
        "next_due_at": to_iso(next_due_at),
    }


async def list_user_folders(db: AsyncSession, user_id: int) -> list[dict]:
    rows = await crud.list_folders_with_counts(db, user_id)
    return [
        {
            "id": int(folder_id),
            "title": title,
            "cards_count": int(cards_count or 0),
        }
        for folder_id, title, cards_count in rows
    ]


async def create_user_folder(db: AsyncSession, *, user_id: int, title: str) -> int:
    normalized_title = _normalize_text(
        title,
        field_name="title",
        max_length=MAX_FOLDER_TITLE_LENGTH,
    )
    try:
        folder = await crud.create_folder(
            db,
            user_id=user_id,
            title=normalized_title,
        )
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="folder already exists") from exc
    return int(folder.id)


async def delete_user_folder(db: AsyncSession, *, user_id: int, folder_id: int) -> None:
    folder = await crud.get_folder(db, user_id=user_id, folder_id=folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    await db.delete(folder)


async def get_user_folder_detail(db: AsyncSession, *, user_id: int, folder_id: int) -> dict:
    folder = await crud.get_folder(db, user_id=user_id, folder_id=folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    cards = await crud.list_folder_cards(db, user_id=user_id, folder_id=folder_id)
    return {
        "folder": {
            "id": int(folder.id),
            "title": folder.title,
        },
        "cards": [
            {
                "id": int(card.id),
                "front": card.prompt_text,
                "back": card.answer_text,
                "created_at": to_iso(card.created_at),
            }
            for card in cards
        ],
    }


async def create_user_folder_card(
    db: AsyncSession,
    *,
    user_id: int,
    folder_id: int,
    front: str,
    back: str,
) -> int:
    folder = await crud.get_folder(db, user_id=user_id, folder_id=folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    normalized_front = _normalize_text(front, field_name="front", max_length=MAX_CARD_SIDE_LENGTH)
    normalized_back = _normalize_text(back, field_name="back", max_length=MAX_CARD_SIDE_LENGTH)
    normalized_front_norm = normalize_kyrgyz_text(normalized_front)
    if not normalized_front_norm:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="front cannot be empty")

    try:
        card = await crud.create_folder_card(
            db,
            user_id=user_id,
            folder_id=folder_id,
            front=normalized_front,
            back=normalized_back,
            front_norm=normalized_front_norm,
        )
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="card already exists in folder") from exc
    folder.updated_at = utcnow()
    card.updated_at = utcnow()
    return int(card.id)


async def delete_user_folder_card(
    db: AsyncSession,
    *,
    user_id: int,
    folder_id: int,
    card_id: int,
) -> None:
    folder = await crud.get_folder(db, user_id=user_id, folder_id=folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    card = await crud.get_folder_card(
        db,
        user_id=user_id,
        folder_id=folder_id,
        card_id=card_id,
    )
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    folder.updated_at = utcnow()
    await db.delete(card)
