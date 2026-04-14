from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.dependencies import require_current_user
from app.modules.subscriptions.service import ensure_song_study_access
from app.modules.xp.schemas import CompleteSongResponse, OpenSongResponse, ProgressResponse
from app.modules.xp.service import build_progress_payload, complete_song, open_song_page

router = APIRouter(tags=["XP"])


@router.get("/progress", response_model=ProgressResponse)
async def progress_endpoint(user=Depends(require_current_user)):
    payload = build_progress_payload(user.experience)
    return {"ok": True, **payload}


@router.post("/songs/{song_id}/open", response_model=OpenSongResponse)
async def open_song_endpoint(
    song_id: int,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_song_study_access(db, user, song_id)
    session_id = await open_song_page(db, user_id=user.id, song_id=song_id)
    await db.commit()
    return {"ok": True, "session_id": session_id}


@router.post("/songs/{song_id}/complete", response_model=CompleteSongResponse)
async def complete_song_endpoint(
    song_id: int,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_song_study_access(db, user, song_id)
    result = await complete_song(db, user_id=user.id, song_id=song_id)
    await db.commit()
    return {"ok": True, **result}
