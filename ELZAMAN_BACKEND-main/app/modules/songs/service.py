from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Artist, Song, SongAudioSource, UserUnlockedSong

YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
}


def _require_not_none(value, field_name: str):  # noqa: ANN001, ANN201
    if value is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} cannot be null")
    return value


def _normalize_song_text(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} is required")
    return cleaned


def _serialize_song(
    song: Song,
    author_name: str,
    audio_url: str | None = None,
    audio_provider: str | None = None,
) -> dict[str, object]:
    return {
        "id": song.id,
        "title": song.title,
        "author": author_name,
        "lyrics_text": song.lyrics_text or "",
        "lyrics_text_ru": song.lyrics_text_ru or None,
        "original_language": song.original_language,
        "release_year": song.release_year,
        "duration_seconds": song.duration_seconds,
        "is_published": bool(song.is_published),
        "youtube_url": audio_url if (audio_provider or "").lower() == "youtube" else None,
        "created_at": song.created_at,
        "audio_url": audio_url,
    }


async def _get_or_create_artist(db: AsyncSession, author_name: str) -> Artist:
    result = await db.execute(select(Artist).where(Artist.name == author_name))
    artist = result.scalar_one_or_none()
    if artist:
        return artist

    try:
        async with db.begin_nested():
            artist = Artist(name=author_name)
            db.add(artist)
            await db.flush()
            return artist
    except IntegrityError:
        result = await db.execute(select(Artist).where(Artist.name == author_name))
        artist = result.scalar_one_or_none()
        if artist:
            return artist
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="could not create artist, please try again",
        )


def _normalize_language(value: str) -> str:
    language = value.strip().lower() or "und"
    if len(language) > 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="original_language is too long")
    return language


def _validate_optional_ranges(release_year: int | None, duration_seconds: int | None) -> None:
    if release_year is not None and not (1800 <= int(release_year) <= 2200):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="release_year must be between 1800 and 2200")
    if duration_seconds is not None and int(duration_seconds) <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="duration_seconds must be positive")


def _normalize_youtube_url(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="youtube_url must start with http:// or https://")

    host = (parsed.hostname or "").lower()
    if host not in YOUTUBE_HOSTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="youtube_url must point to youtube.com or youtu.be")

    return normalized


async def _get_artist_name(db: AsyncSession, artist_id: int) -> str:
    result = await db.execute(select(Artist.name).where(Artist.id == artist_id))
    return result.scalar_one_or_none() or ""


async def _get_primary_audio_source(db: AsyncSession, song_id: int) -> tuple[str | None, str | None]:
    result = await db.execute(
        select(SongAudioSource.external_url, SongAudioSource.provider)
        .where(
            SongAudioSource.song_id == song_id,
            SongAudioSource.is_primary.is_(True),
        )
        .order_by(SongAudioSource.id.asc())
    )
    row = result.first()
    if not row:
        return None, None
    return row[0], row[1]


async def _set_youtube_audio_source(db: AsyncSession, song_id: int, youtube_url: str) -> str:
    result = await db.execute(
        select(SongAudioSource)
        .where(SongAudioSource.song_id == song_id)
        .order_by(SongAudioSource.id.asc())
    )
    sources = list(result.scalars().all())
    youtube_source = next((source for source in sources if source.provider == "youtube"), None)

    if youtube_source is None:
        youtube_source = SongAudioSource(
            song_id=song_id,
            provider="youtube",
            external_url=youtube_url,
            is_primary=True,
        )
        db.add(youtube_source)
        sources.append(youtube_source)
    else:
        youtube_source.external_url = youtube_url
        youtube_source.is_primary = True

    for source in sources:
        if source is not youtube_source:
            source.is_primary = False

    await db.flush()
    return youtube_url


async def _remove_youtube_audio_source(db: AsyncSession, song_id: int) -> tuple[str | None, str | None]:
    result = await db.execute(
        select(SongAudioSource)
        .where(SongAudioSource.song_id == song_id)
        .order_by(SongAudioSource.id.asc())
    )
    sources = list(result.scalars().all())
    youtube_source = next((source for source in sources if source.provider == "youtube"), None)
    if youtube_source is None:
        return await _get_primary_audio_source(db, song_id)

    was_primary = bool(youtube_source.is_primary)
    await db.delete(youtube_source)
    await db.flush()

    if was_primary:
        fallback_source = next((source for source in sources if source is not youtube_source), None)
        if fallback_source is not None:
            fallback_source.is_primary = True
            await db.flush()

    return await _get_primary_audio_source(db, song_id)


async def create_song_for_user(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    author: str,
    lyrics_text: str,
    lyrics_text_ru: str | None,
    youtube_url: str | None,
    original_language: str,
    release_year: int | None,
    duration_seconds: int | None,
    is_published: bool,
) -> dict[str, object]:
    clean_title = _normalize_song_text(title, "title")
    clean_author = _normalize_song_text(author, "author")
    clean_lyrics = _normalize_song_text(lyrics_text, "lyrics_text")
    clean_lyrics_ru = lyrics_text_ru.strip() if lyrics_text_ru else None
    clean_youtube_url = _normalize_youtube_url(youtube_url)
    clean_language = _normalize_language(original_language)
    _validate_optional_ranges(release_year, duration_seconds)

    artist = await _get_or_create_artist(db, clean_author)

    try:
        song = Song(
            artist_id=artist.id,
            title=clean_title,
            lyrics_text=clean_lyrics,
            lyrics_text_ru=clean_lyrics_ru,
            original_language=clean_language,
            release_year=release_year,
            duration_seconds=duration_seconds,
            is_published=bool(is_published),
        )
        db.add(song)
        await db.flush()

        if clean_youtube_url:
            db.add(
                SongAudioSource(
                    song_id=song.id,
                    provider="youtube",
                    external_url=clean_youtube_url,
                    is_primary=True,
                )
            )
            await db.flush()

        unlocked = await db.execute(
            select(UserUnlockedSong).where(
                UserUnlockedSong.user_id == user_id,
                UserUnlockedSong.song_id == song.id,
            )
        )
        if not unlocked.scalar_one_or_none():
            db.add(
                UserUnlockedSong(
                    user_id=user_id,
                    song_id=song.id,
                    source="created",
                )
            )
            await db.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"database conflict: {exc.orig}",
        ) from exc

    return _serialize_song(song, artist.name, clean_youtube_url, "youtube" if clean_youtube_url else None)


async def update_song_for_user(
    db: AsyncSession,
    *,
    song_id: int,
    updates: dict[str, object],
) -> dict[str, object]:
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no fields to update")

    song = await db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    if "title" in updates:
        title = _require_not_none(updates["title"], "title")
        song.title = _normalize_song_text(title, "title")

    if "lyrics_text" in updates:
        lyrics_text = _require_not_none(updates["lyrics_text"], "lyrics_text")
        song.lyrics_text = _normalize_song_text(lyrics_text, "lyrics_text")

    if "lyrics_text_ru" in updates:
        raw_ru = updates["lyrics_text_ru"]
        song.lyrics_text_ru = raw_ru.strip() if raw_ru else None

    if "original_language" in updates:
        original_language = _require_not_none(updates["original_language"], "original_language")
        song.original_language = _normalize_language(original_language)

    new_release_year = song.release_year
    new_duration_seconds = song.duration_seconds
    if "release_year" in updates:
        new_release_year = updates["release_year"]
    if "duration_seconds" in updates:
        new_duration_seconds = updates["duration_seconds"]
    _validate_optional_ranges(new_release_year, new_duration_seconds)
    if "release_year" in updates:
        song.release_year = new_release_year
    if "duration_seconds" in updates:
        song.duration_seconds = new_duration_seconds

    if "is_published" in updates:
        is_published = _require_not_none(updates["is_published"], "is_published")
        song.is_published = bool(is_published)

    if "author" in updates:
        author = _require_not_none(updates["author"], "author")
        clean_author = _normalize_song_text(author, "author")
        artist = await _get_or_create_artist(db, clean_author)
        song.artist_id = artist.id

    await db.flush()

    if "youtube_url" in updates:
        normalized_url = _normalize_youtube_url(updates["youtube_url"])
        if normalized_url:
            audio_url = await _set_youtube_audio_source(db, song.id, normalized_url)
            audio_provider = "youtube"
        else:
            audio_url, audio_provider = await _remove_youtube_audio_source(db, song.id)
    else:
        audio_url, audio_provider = await _get_primary_audio_source(db, song.id)

    author_name = await _get_artist_name(db, song.artist_id)
    return _serialize_song(song, author_name, audio_url, audio_provider)


async def get_song_detail(db: AsyncSession, song_id: int) -> dict[str, object]:
    result = await db.execute(
        select(Song, Artist, SongAudioSource)
        .join(Artist, Artist.id == Song.artist_id)
        .outerjoin(
            SongAudioSource,
            and_(SongAudioSource.song_id == Song.id, SongAudioSource.is_primary.is_(True)),
        )
        .where(Song.id == song_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    song, artist, source = row
    return _serialize_song(
        song,
        artist.name,
        source.external_url if source else None,
        source.provider if source else None,
    )


async def list_songs(
    db: AsyncSession,
    *,
    limit: int,
    offset: int,
    query: str | None = None,
    only_published: bool = False,
) -> tuple[int, list[dict[str, object]]]:
    search = (query or "").strip()

    count_stmt = select(func.count(Song.id)).select_from(Song).join(Artist, Artist.id == Song.artist_id)
    rows_stmt = (
        select(Song, Artist, SongAudioSource)
        .join(Artist, Artist.id == Song.artist_id)
        .outerjoin(
            SongAudioSource,
            and_(SongAudioSource.song_id == Song.id, SongAudioSource.is_primary.is_(True)),
        )
        .order_by(Song.created_at.desc(), Song.id.desc())
        .limit(limit)
        .offset(offset)
    )

    if search:
        like = f"%{search}%"
        predicate = or_(
            Song.title.ilike(like),
            Artist.name.ilike(like),
            Song.lyrics_text.ilike(like),
        )
        count_stmt = count_stmt.where(predicate)
        rows_stmt = rows_stmt.where(predicate)

    if only_published:
        count_stmt = count_stmt.where(Song.is_published.is_(True))
        rows_stmt = rows_stmt.where(Song.is_published.is_(True))

    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(rows_stmt)).all()
    items = [
        _serialize_song(
            song,
            artist.name,
            source.external_url if source else None,
            source.provider if source else None,
        )
        for song, artist, source in rows
    ]
    return total, items



async def get_song_lyrics_for_user(db: AsyncSession, *, user_id: int, song_id: int) -> tuple[int, str]:
    song = await db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    unlocked = await db.execute(
        select(UserUnlockedSong).where(
            UserUnlockedSong.user_id == user_id,
            UserUnlockedSong.song_id == song_id,
        )
    )
    if not unlocked.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="song is locked")

    return song.id, song.lyrics_text or "", song.lyrics_text_ru or None
