from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.dependencies import require_current_user
from app.modules.playlists.schemas import (
    OkResponse,
    PlaylistCreateRequest,
    PlaylistCreateResponse,
    PlaylistDetailResponse,
    PlaylistSongAddRequest,
    PlaylistSongAddResponse,
    PlaylistSongsResponse,
    PlaylistsResponse,
)
from app.modules.playlists.service import (
    add_song_to_playlist,
    create_playlist,
    delete_playlist,
    list_playlists,
    list_playlist_songs,
    playlist_detail,
    remove_song_from_playlist,
)

router = APIRouter(prefix="/playlists", tags=["Playlists"])


@router.get("", response_model=PlaylistsResponse)
async def playlists(user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    return {"ok": True, "playlists": await list_playlists(db, user.id)}


@router.post("", response_model=PlaylistCreateResponse)
async def create_playlist_endpoint(
    payload: PlaylistCreateRequest,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    playlist = await create_playlist(db, user.id, payload.title, payload.description)
    await db.commit()
    return {"ok": True, "playlist_id": playlist.id}


@router.get("/{playlist_id}", response_model=PlaylistDetailResponse)
async def playlist_detail_endpoint(playlist_id: int, user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    detail = await playlist_detail(db, playlist_id, user.id)
    return {"ok": True, **detail}


@router.get("/{playlist_id}/songs", response_model=PlaylistSongsResponse)
async def playlist_songs_endpoint(playlist_id: int, user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    songs = await list_playlist_songs(db, playlist_id, user.id)
    return {"ok": True, "songs": songs}


@router.post(
    "/{playlist_id}/songs",
    response_model=PlaylistSongAddResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_song_endpoint(
    playlist_id: int,
    payload: PlaylistSongAddRequest,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    relation = await add_song_to_playlist(db, playlist_id, user.id, payload.song_id)
    await db.commit()
    return {"ok": True, **relation}


@router.delete("/{playlist_id}/songs/{song_id}", response_model=OkResponse)
async def remove_song_endpoint(playlist_id: int, song_id: int, user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    await remove_song_from_playlist(db, playlist_id, user.id, song_id)
    await db.commit()
    return OkResponse()


@router.delete("/{playlist_id}", response_model=OkResponse)
async def delete_playlist_endpoint(playlist_id: int, user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    await delete_playlist(db, playlist_id, user.id)
    await db.commit()
    return OkResponse()
