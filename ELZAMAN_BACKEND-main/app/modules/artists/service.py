from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Artist, Song


def _normalize_artist_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name is required")
    return cleaned


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _normalize_avatar_url(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="avatar_url must start with http:// or https://",
        )
    if not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="avatar_url must include a host",
        )
    return normalized


def _serialize_artist(artist: Artist) -> dict[str, object]:
    return {
        "id": artist.id,
        "name": artist.name,
        "bio": artist.bio,
        "avatar_url": artist.avatar_url,
        "created_at": artist.created_at,
    }


async def _find_artist_by_name(
    db: AsyncSession,
    *,
    name: str,
    exclude_artist_id: int | None = None,
) -> Artist | None:
    stmt = select(Artist).where(func.lower(Artist.name) == name.lower())
    if exclude_artist_id is not None:
        stmt = stmt.where(Artist.id != exclude_artist_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_artist(
    db: AsyncSession,
    *,
    name: str,
    bio: str | None,
    avatar_url: str | None,
) -> dict[str, object]:
    clean_name = _normalize_artist_name(name)
    clean_bio = _normalize_optional_text(bio)
    clean_avatar_url = _normalize_avatar_url(avatar_url)

    existing = await _find_artist_by_name(db, name=clean_name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="artist with this name already exists",
        )

    artist = Artist(
        name=clean_name,
        bio=clean_bio,
        avatar_url=clean_avatar_url,
    )
    db.add(artist)
    await db.flush()
    return _serialize_artist(artist)


async def list_artists(
    db: AsyncSession,
    *,
    limit: int,
    offset: int,
    query: str | None = None,
) -> tuple[int, list[dict[str, object]]]:
    search = (query or "").strip()
    count_stmt = select(func.count(Artist.id)).select_from(Artist)
    rows_stmt = (
        select(Artist)
        .order_by(Artist.created_at.desc(), Artist.id.desc())
        .limit(limit)
        .offset(offset)
    )

    if search:
        like = f"%{search}%"
        predicate = or_(
            Artist.name.ilike(like),
            Artist.bio.ilike(like),
        )
        count_stmt = count_stmt.where(predicate)
        rows_stmt = rows_stmt.where(predicate)

    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    artists = (await db.execute(rows_stmt)).scalars().all()
    return total, [_serialize_artist(artist) for artist in artists]


async def get_artist_detail(db: AsyncSession, artist_id: int) -> dict[str, object]:
    artist = await db.get(Artist, artist_id)
    if not artist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    return _serialize_artist(artist)


async def update_artist(
    db: AsyncSession,
    *,
    artist_id: int,
    updates: dict[str, object],
) -> dict[str, object]:
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no fields to update")

    artist = await db.get(Artist, artist_id)
    if not artist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    if "name" in updates:
        name_value = updates["name"]
        if name_value is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name cannot be null")
        clean_name = _normalize_artist_name(str(name_value))
        existing = await _find_artist_by_name(db, name=clean_name, exclude_artist_id=artist.id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="artist with this name already exists",
            )
        artist.name = clean_name

    if "bio" in updates:
        bio_value = updates["bio"]
        artist.bio = _normalize_optional_text(None if bio_value is None else str(bio_value))

    if "avatar_url" in updates:
        avatar_value = updates["avatar_url"]
        artist.avatar_url = _normalize_avatar_url(None if avatar_value is None else str(avatar_value))

    await db.flush()
    return _serialize_artist(artist)


async def delete_artist(db: AsyncSession, artist_id: int) -> None:
    artist = await db.get(Artist, artist_id)
    if not artist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    songs_count = int(
        (await db.execute(select(func.count(Song.id)).where(Song.artist_id == artist_id))).scalar_one() or 0
    )
    if songs_count > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="cannot delete artist with songs")

    await db.delete(artist)
    await db.flush()
