from fastapi import HTTPException, status
from sqlalchemy import and_, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Song, SongAudioSource, UserPlaylist, UserPlaylistSong, UserUnlockedSong


async def list_playlists(db: AsyncSession, user_id: int) -> list[dict]:
    result = await db.execute(
        select(UserPlaylist)
        .where(UserPlaylist.user_id == user_id)
        .order_by(UserPlaylist.created_at.desc())
    )
    return [
        {"id": playlist.id, "title": playlist.title, "description": playlist.description}
        for playlist in result.scalars().all()
    ]


async def create_playlist(db: AsyncSession, user_id: int, title: str, description: str | None) -> UserPlaylist:
    clean_title = title.strip()
    clean_description = (description or "").strip()
    if not clean_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="playlist title cannot be empty")

    playlist = UserPlaylist(
        user_id=user_id,
        title=clean_title,
        description=clean_description or None,
        is_public=False,
    )
    db.add(playlist)
    await db.flush()
    return playlist


async def get_user_playlist(db: AsyncSession, playlist_id: int, user_id: int) -> UserPlaylist:
    playlist = await db.get(UserPlaylist, playlist_id)
    if not playlist or playlist.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    return playlist


def _serialize_playlist_song(playlist_song: UserPlaylistSong, song: Song, source: SongAudioSource | None) -> dict:
    return {
        "id": song.id,
        "title": song.title,
        "audio_url": source.external_url if source else None,
        "position": playlist_song.position,
        "added_at": playlist_song.added_at,
    }


async def _list_playlist_songs(db: AsyncSession, playlist_id: int) -> list[dict]:
    result = await db.execute(
        select(UserPlaylistSong, Song, SongAudioSource)
        .join(Song, Song.id == UserPlaylistSong.song_id)
        .outerjoin(
            SongAudioSource,
            and_(SongAudioSource.song_id == Song.id, SongAudioSource.is_primary.is_(True)),
        )
        .where(UserPlaylistSong.playlist_id == playlist_id)
        .order_by(
            UserPlaylistSong.position.asc(),
            UserPlaylistSong.added_at.asc(),
            Song.id.asc(),
        )
    )
    return [_serialize_playlist_song(playlist_song, song, source) for playlist_song, song, source in result.all()]


async def list_playlist_songs(db: AsyncSession, playlist_id: int, user_id: int) -> list[dict]:
    await get_user_playlist(db, playlist_id, user_id)
    return await _list_playlist_songs(db, playlist_id)


async def add_song_to_playlist(db: AsyncSession, playlist_id: int, user_id: int, song_id: int) -> dict:
    await get_user_playlist(db, playlist_id, user_id)
    song = await db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="song not found")

    max_position_result = await db.execute(
        select(func.max(UserPlaylistSong.position)).where(UserPlaylistSong.playlist_id == playlist_id)
    )
    next_position = int(max_position_result.scalar_one_or_none() or 0) + 1

    playlist_song = UserPlaylistSong(
        playlist_id=playlist_id,
        song_id=song_id,
        position=next_position,
    )

    try:
        async with db.begin_nested():
            db.add(playlist_song)
            await db.flush()
    except IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="playlist song already exists") from exc

    return {
        "playlist_id": playlist_song.playlist_id,
        "song_id": playlist_song.song_id,
        "position": playlist_song.position,
        "added_at": playlist_song.added_at,
    }


async def playlist_detail(db: AsyncSession, playlist_id: int, user_id: int) -> dict:
    playlist = await get_user_playlist(db, playlist_id, user_id)
    songs = await _list_playlist_songs(db, playlist_id)

    result = await db.execute(
        select(Song, SongAudioSource)
        .join(UserUnlockedSong, UserUnlockedSong.song_id == Song.id)
        .outerjoin(
            UserPlaylistSong,
            and_(
                UserPlaylistSong.song_id == Song.id,
                UserPlaylistSong.playlist_id == playlist_id,
            ),
        )
        .outerjoin(
            SongAudioSource,
            and_(SongAudioSource.song_id == Song.id, SongAudioSource.is_primary.is_(True)),
        )
        .where(
            UserUnlockedSong.user_id == user_id,
            UserPlaylistSong.song_id.is_(None),
        )
        .order_by(Song.created_at.desc())
    )
    available = [
        {
            "id": song.id,
            "title": song.title,
            "audio_url": source.external_url if source else None,
        }
        for song, source in result.all()
    ]

    return {
        "playlist": {
            "id": playlist.id,
            "title": playlist.title,
            "description": playlist.description,
        },
        "songs": songs,
        "available_songs": available,
    }


async def remove_song_from_playlist(db: AsyncSession, playlist_id: int, user_id: int, song_id: int) -> None:
    await get_user_playlist(db, playlist_id, user_id)
    result = await db.execute(
        delete(UserPlaylistSong).where(
            UserPlaylistSong.playlist_id == playlist_id,
            UserPlaylistSong.song_id == song_id,
        )
    )
    if int(result.rowcount or 0) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="playlist song not found")


async def delete_playlist(db: AsyncSession, playlist_id: int, user_id: int) -> None:
    await get_user_playlist(db, playlist_id, user_id)
    await db.execute(delete(UserPlaylistSong).where(UserPlaylistSong.playlist_id == playlist_id))
    await db.execute(delete(UserPlaylist).where(UserPlaylist.id == playlist_id))
