from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.dependencies import require_current_user
from app.modules.flashcards.schemas import (
    CardCreate,
    CardCreateOut,
    FlashcardReviewRequest,
    FlashcardReviewResponse,
    FlashcardsDueResponse,
    FolderCreate,
    FolderCreateOut,
    FolderDetailOut,
    FolderListOut,
    OkResponse,
)
from app.modules.flashcards.service import (
    create_user_folder,
    create_user_folder_card,
    delete_user_folder,
    delete_user_folder_card,
    get_due_flashcards,
    get_user_folder_detail,
    list_user_folders,
    review_flashcard,
)

router = APIRouter(prefix="/flashcards", tags=["Flashcards"])


@router.get("/folders", response_model=FolderListOut)
async def flashcard_folders(user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    folders = await list_user_folders(db, user.id)
    return {"ok": True, "folders": folders}


@router.post("/folders", response_model=FolderCreateOut)
async def flashcard_folder_create(
    payload: FolderCreate,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder_id = await create_user_folder(
        db,
        user_id=user.id,
        title=payload.title,
    )
    await db.commit()
    return {"ok": True, "folder_id": folder_id}


@router.delete("/folders/{folder_id}", response_model=OkResponse)
async def flashcard_folder_delete(folder_id: int, user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    await delete_user_folder(
        db,
        user_id=user.id,
        folder_id=folder_id,
    )
    await db.commit()
    return {"ok": True}


@router.get("/folders/{folder_id}", response_model=FolderDetailOut)
async def flashcard_folder_detail(folder_id: int, user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    payload = await get_user_folder_detail(
        db,
        user_id=user.id,
        folder_id=folder_id,
    )
    return {"ok": True, **payload}


@router.post("/folders/{folder_id}/cards", response_model=CardCreateOut)
async def flashcard_card_create(
    folder_id: int,
    payload: CardCreate,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    card_id = await create_user_folder_card(
        db,
        user_id=user.id,
        folder_id=folder_id,
        front=payload.front,
        back=payload.back,
    )
    await db.commit()
    return {"ok": True, "card_id": card_id}


@router.delete("/folders/{folder_id}/cards/{card_id}", response_model=OkResponse)
async def flashcard_card_delete(
    folder_id: int,
    card_id: int,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_user_folder_card(
        db,
        user_id=user.id,
        folder_id=folder_id,
        card_id=card_id,
    )
    await db.commit()
    return {"ok": True}


@router.get("/due", response_model=FlashcardsDueResponse)
async def flashcards_due(user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    items = await get_due_flashcards(db, user.id)
    await db.commit()
    return {"ok": True, "items": items}


@router.post("/{flashcard_id}/review", response_model=FlashcardReviewResponse)
async def flashcard_review(
    flashcard_id: int,
    payload: FlashcardReviewRequest,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await review_flashcard(
        db,
        user_id=user.id,
        flashcard_id=flashcard_id,
        correct=payload.correct,
    )
    await db.commit()
    return {"ok": True, **result}
