from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.dependencies import require_admin_user, require_current_user
from app.modules.songs.schemas import (
    SongCreateRequest,
    SongCreateResponse,
    SongDetailResponse,
    SongListResponse,
    SongLyricsResponse,
    SongPatchRequest,
)
from app.modules.songs.service import (
    create_song_for_user,
    get_song_detail,
    get_song_lyrics_for_user,
    list_songs,
    update_song_for_user,
)

router = APIRouter(prefix="/songs", tags=["Songs"])


@router.post("", response_model=SongCreateResponse)
async def create_song_endpoint(
    payload: SongCreateRequest,
    user=Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    song = await create_song_for_user(
        db,
        user_id=user.id,
        title=payload.title,
        author=payload.author,
        lyrics_text=payload.lyrics_text,
        lyrics_text_ru=payload.lyrics_text_ru,
        youtube_url=payload.youtube_url,
        original_language=payload.original_language,
        release_year=payload.release_year,
        duration_seconds=payload.duration_seconds,
        is_published=payload.is_published,
    )
    await db.commit()
    return {"ok": True, "song": song}


@router.get("", response_model=SongListResponse)
async def list_songs_endpoint(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None),
    _: object = Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    total, items = await list_songs(db, limit=limit, offset=offset, query=q)
    return {"ok": True, "items": items, "total": total, "limit": limit, "offset": offset}



@router.get("/{song_id}", response_model=SongDetailResponse)
async def song_detail_endpoint(song_id: int, _: object = Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    song = await get_song_detail(db, song_id)
    return {"ok": True, "song": song}


@router.patch("/{song_id}", response_model=SongDetailResponse)
async def song_patch_endpoint(
    song_id: int,
    payload: SongPatchRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    song = await update_song_for_user(
        db,
        song_id=song_id,
        updates=payload.model_dump(exclude_unset=True),
    )
    await db.commit()
    return {"ok": True, "song": song}


@router.get("/{song_id}/lyrics", response_model=SongLyricsResponse)
async def song_lyrics_endpoint(song_id: int, user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    current_song_id, lyrics_text, lyrics_text_ru = await get_song_lyrics_for_user(db, user_id=user.id, song_id=song_id)
    return {"ok": True, "song_id": current_song_id, "lyrics_text": lyrics_text, "lyrics_text_ru": lyrics_text_ru}
