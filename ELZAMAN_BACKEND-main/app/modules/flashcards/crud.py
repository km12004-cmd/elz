from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Flashcard, FlashcardFolder


async def list_folders_with_counts(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(
            FlashcardFolder.id,
            FlashcardFolder.title,
            func.count(Flashcard.id).label("cards_count"),
        )
        .outerjoin(
            Flashcard,
            and_(
                Flashcard.folder_id == FlashcardFolder.id,
                Flashcard.source_type == "folder",
            ),
        )
        .where(FlashcardFolder.user_id == user_id)
        .group_by(FlashcardFolder.id, FlashcardFolder.title, FlashcardFolder.created_at)
        .order_by(FlashcardFolder.created_at.desc(), FlashcardFolder.id.desc())
    )
    return result.all()


async def get_folder(db: AsyncSession, *, user_id: int, folder_id: int) -> FlashcardFolder | None:
    result = await db.execute(
        select(FlashcardFolder).where(
            FlashcardFolder.id == folder_id,
            FlashcardFolder.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def create_folder(db: AsyncSession, *, user_id: int, title: str) -> FlashcardFolder:
    folder = FlashcardFolder(
        user_id=user_id,
        title=title,
    )
    db.add(folder)
    await db.flush()
    return folder


async def list_folder_cards(db: AsyncSession, *, user_id: int, folder_id: int):
    result = await db.execute(
        select(Flashcard)
        .where(
            Flashcard.source_type == "folder",
            Flashcard.user_id == user_id,
            Flashcard.folder_id == folder_id,
        )
        .order_by(Flashcard.created_at.desc(), Flashcard.id.desc())
    )
    return result.scalars().all()


async def create_folder_card(
    db: AsyncSession,
    *,
    user_id: int,
    folder_id: int,
    front: str,
    back: str,
    front_norm: str,
) -> Flashcard:
    card = Flashcard(
        source_type="folder",
        folder_id=folder_id,
        user_id=user_id,
        prompt_text=front,
        answer_text=back,
        prompt_text_norm=front_norm,
    )
    db.add(card)
    await db.flush()
    return card


async def get_folder_card(
    db: AsyncSession,
    *,
    user_id: int,
    folder_id: int,
    card_id: int,
) -> Flashcard | None:
    result = await db.execute(
        select(Flashcard).where(
            Flashcard.id == card_id,
            Flashcard.folder_id == folder_id,
            Flashcard.user_id == user_id,
            Flashcard.source_type == "folder",
        )
    )
    return result.scalar_one_or_none()
