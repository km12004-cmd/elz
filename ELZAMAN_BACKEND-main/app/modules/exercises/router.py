from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.dependencies import require_current_user
from app.modules.exercise2.service import create_game2_pairs_templates, list_game2_pairs_templates
from app.modules.exercises.schemas import (
    ExerciseTemplateBulkCreateRequest,
    ExerciseTemplateBulkCreateResponse,
    ExerciseTemplateItem,
)
from app.modules.tracks.service import create_flashcard_templates, list_flashcard_templates

router = APIRouter(tags=["Exercises"])


def _normalize_exercise_idx(exercise_idx: int) -> int:
    normalized = int(exercise_idx)
    if normalized < 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="exercise must be >= 1")
    return normalized


@router.get(
    "/tracks/{track_id}/exercises/{exercise_idx}/templates",
    response_model=list[ExerciseTemplateItem],
)
async def list_exercise_templates_endpoint(
    track_id: int,
    exercise_idx: int,
    level: int | None = Query(default=None, ge=1),
    _: object = Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    exercise_idx = _normalize_exercise_idx(exercise_idx)
    if exercise_idx == 1:
        items = await list_flashcard_templates(db, track_id=track_id, level=level)
        return [
            {
                "id": int(item["id"]),
                "exercise": 1,
                "level": int(item["level"]),
                "kg_text": item["kg_text"],
                "ru_text": item["ru_text"],
                "order": int(item["order"]),
            }
            for item in items
        ]

    items = await list_game2_pairs_templates(db, track_id=track_id, exercise_idx=exercise_idx)
    return [
        {
            "id": int(item["id"]),
            "exercise": exercise_idx,
            "level": None,
            "kg_text": item["kg_text"],
            "ru_text": item["ru_text"],
            "order": int(item["order"]),
        }
        for item in items
    ]


@router.post(
    "/tracks/{track_id}/exercises/{exercise_idx}/templates",
    response_model=ExerciseTemplateBulkCreateResponse,
)
async def create_exercise_templates_endpoint(
    track_id: int,
    exercise_idx: int,
    payload: ExerciseTemplateBulkCreateRequest,
    _: object = Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    exercise_idx = _normalize_exercise_idx(exercise_idx)
    items = [item.model_dump(exclude_none=True) for item in payload.items]

    if exercise_idx == 1:
        result = await create_flashcard_templates(db, track_id=track_id, items=items)
        await db.commit()
        return {
            "track_id": int(result["track_id"]),
            "exercise": 1,
            "created_ids": result["created_ids"],
            "created_count": result["created_count"],
        }

    result = await create_game2_pairs_templates(db, track_id=track_id, exercise_idx=exercise_idx, items=items)
    await db.commit()
    return {
        "track_id": int(result["track_id"]),
        "exercise": int(result.get("exercise", exercise_idx)),
        "created_ids": result["created_ids"],
        "created_count": result["created_count"],
    }
