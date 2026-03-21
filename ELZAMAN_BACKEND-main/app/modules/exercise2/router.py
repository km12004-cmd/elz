from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.dependencies import require_admin_user, require_current_user
from app.modules.exercise2.schemas import (
    DeletePairTemplatesResponse,
    Game2AnswerRequest,
    Game2AnswerResponse,
    Game2FinishResponse,
    Game2PairTemplateBulkCreateRequest,
    Game2PairTemplateBulkCreateResponse,
    Game2PairTemplateItem,
    Game2SessionStatusResponse,
    Game2StartResponse,
)
from app.modules.exercise2.service import (
    create_game2_pairs_templates,
    delete_game2_pairs_templates,
    finish_pairs_session,
    get_pairs_session_status,
    list_game2_pairs_templates,
    start_pairs_session,
    submit_pairs_answer,
)

router = APIRouter(tags=["Exercise 2"])
DEFAULT_EXERCISE_IDX = 2


@router.get("/tracks/{track_id}/games/pairs/templates", response_model=list[Game2PairTemplateItem])
async def game2_pairs_templates_endpoint(
    track_id: int,
    _: object = Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_game2_pairs_templates(db, track_id=track_id, exercise_idx=DEFAULT_EXERCISE_IDX)


@router.post("/tracks/{track_id}/games/pairs/templates", response_model=Game2PairTemplateBulkCreateResponse)
async def create_game2_pairs_templates_endpoint(
    track_id: int,
    payload: Game2PairTemplateBulkCreateRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await create_game2_pairs_templates(
        db,
        track_id=track_id,
        exercise_idx=DEFAULT_EXERCISE_IDX,
        items=[item.model_dump() for item in payload.items],
    )
    await db.commit()
    return result


@router.delete("/tracks/{track_id}/games/pairs/templates", response_model=DeletePairTemplatesResponse)
async def delete_game2_pairs_templates_endpoint(
    track_id: int,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await delete_game2_pairs_templates(
        db, track_id=track_id, exercise_idx=DEFAULT_EXERCISE_IDX,
    )
    await db.commit()
    return result


@router.delete("/tracks/{track_id}/games/pairs/{exercise_idx}/templates", response_model=DeletePairTemplatesResponse)
async def delete_game2_pairs_templates_by_exercise_endpoint(
    track_id: int,
    exercise_idx: int,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await delete_game2_pairs_templates(
        db, track_id=track_id, exercise_idx=exercise_idx,
    )
    await db.commit()
    return result


@router.get("/tracks/{track_id}/games/pairs/{exercise_idx}/templates", response_model=list[Game2PairTemplateItem])
async def game_pairs_templates_by_exercise_endpoint(
    track_id: int,
    exercise_idx: int,
    _: object = Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_game2_pairs_templates(db, track_id=track_id, exercise_idx=exercise_idx)


@router.post("/tracks/{track_id}/games/pairs/{exercise_idx}/templates", response_model=Game2PairTemplateBulkCreateResponse)
async def create_game_pairs_templates_by_exercise_endpoint(
    track_id: int,
    exercise_idx: int,
    payload: Game2PairTemplateBulkCreateRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await create_game2_pairs_templates(
        db,
        track_id=track_id,
        exercise_idx=exercise_idx,
        items=[item.model_dump() for item in payload.items],
    )
    await db.commit()
    return result


@router.post("/tracks/{track_id}/games/pairs/start", response_model=Game2StartResponse)
async def start_pairs_session_endpoint(
    track_id: int,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    payload = await start_pairs_session(db, user_id=user.id, track_id=track_id, exercise_idx=DEFAULT_EXERCISE_IDX)
    await db.commit()
    return payload


@router.post("/tracks/{track_id}/games/pairs/{exercise_idx}/start", response_model=Game2StartResponse)
async def start_pairs_session_by_exercise_endpoint(
    track_id: int,
    exercise_idx: int,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    payload = await start_pairs_session(
        db,
        user_id=user.id,
        track_id=track_id,
        exercise_idx=exercise_idx,
    )
    await db.commit()
    return payload


@router.post("/games/pairs/{session_id}/answer", response_model=Game2AnswerResponse)
async def submit_pairs_answer_endpoint(
    session_id: str,
    payload: Game2AnswerRequest,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await submit_pairs_answer(
        db,
        user_id=user.id,
        session_id=session_id,
        pair_id=payload.pair_id,
        option_id=payload.option_id,
    )
    await db.commit()
    return result


@router.post("/games/pairs/{session_id}/finish", response_model=Game2FinishResponse)
async def finish_pairs_session_endpoint(
    session_id: str,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await finish_pairs_session(db, user_id=user.id, session_id=session_id)
    await db.commit()
    return result


@router.get("/games/pairs/{session_id}", response_model=Game2SessionStatusResponse)
async def pairs_session_status_endpoint(
    session_id: str,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_pairs_session_status(db, user_id=user.id, session_id=session_id)
