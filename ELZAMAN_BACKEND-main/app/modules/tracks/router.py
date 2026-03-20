from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.dependencies import require_admin_user, require_current_user
from app.modules.tracks.schemas import (
    DeleteTemplatesResponse,
    FlashcardTemplateBulkCreateRequest,
    FlashcardTemplateBulkCreateResponse,
    FlashcardTemplateItem,
    LearningStateResponse,
    MarkListenedRequest,
    MarkListenedResponse,
    StartLearningResponse,
    TrackLevelCardsResponse,
)
from app.modules.tracks.service import (
    create_flashcard_templates,
    delete_flashcard_templates,
    delete_track_level_cards,
    get_learning_state,
    list_flashcard_templates,
    list_track_level_cards,
    mark_listened,
    start_learning,
)

router = APIRouter(prefix="/tracks", tags=["Exercise 1"])


@router.post("/{track_id}/start-learning", response_model=StartLearningResponse)
async def start_learning_endpoint(
    track_id: int,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    payload = await start_learning(db, user_id=user.id, track_id=track_id)
    await db.commit()
    return payload


@router.get("/{track_id}/learning-state", response_model=LearningStateResponse)
async def learning_state_endpoint(
    track_id: int,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_learning_state(db, user_id=user.id, track_id=track_id)


@router.get("/{track_id}/flashcard-templates", response_model=list[FlashcardTemplateItem])
async def flashcard_templates_endpoint(
    track_id: int,
    level: int | None = Query(default=None, ge=1),
    _: object = Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_flashcard_templates(db, track_id=track_id, level=level)


@router.post("/{track_id}/flashcard-templates", response_model=FlashcardTemplateBulkCreateResponse)
async def create_flashcard_templates_endpoint(
    track_id: int,
    payload: FlashcardTemplateBulkCreateRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await create_flashcard_templates(
        db,
        track_id=track_id,
        items=[item.model_dump() for item in payload.items],
    )
    await db.commit()
    return result


@router.delete("/{track_id}/flashcard-templates", response_model=DeleteTemplatesResponse)
async def delete_flashcard_templates_endpoint(
    track_id: int,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await delete_flashcard_templates(db, track_id=track_id)
    await db.commit()
    return result


@router.delete("/{track_id}/levels/{level}/cards", response_model=DeleteTemplatesResponse)
async def delete_track_level_cards_endpoint(
    track_id: int,
    level: int,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await delete_track_level_cards(db, track_id=track_id, level=level)
    await db.commit()
    return result


@router.get("/{track_id}/levels/{level}/cards", response_model=TrackLevelCardsResponse)
async def track_level_cards_endpoint(
    track_id: int,
    level: int,
    _: object = Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_track_level_cards(db, track_id=track_id, level=level)


@router.post("/{track_id}/listened", response_model=MarkListenedResponse)
async def track_listened_endpoint(
    track_id: int,
    payload: MarkListenedRequest,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await mark_listened(
        db,
        user_id=user.id,
        track_id=track_id,
        percent=payload.percent,
        seconds_listened=payload.seconds_listened,
    )
    await db.commit()
    return result
