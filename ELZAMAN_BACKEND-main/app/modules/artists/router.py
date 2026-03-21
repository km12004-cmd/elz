from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.artists.schemas import (
    ArtistCreateRequest,
    ArtistCreateResponse,
    ArtistDetailResponse,
    ArtistListResponse,
    ArtistPatchRequest,
    OkResponse,
)
from app.modules.artists.service import (
    create_artist,
    delete_artist,
    get_artist_detail,
    list_artists,
    update_artist,
)
from app.modules.auth.dependencies import require_admin_user, require_current_user

router = APIRouter(prefix="/artists", tags=["Artists"])


@router.post("", response_model=ArtistCreateResponse)
async def create_artist_endpoint(
    payload: ArtistCreateRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    artist = await create_artist(
        db,
        name=payload.name,
        bio=payload.bio,
        avatar_url=payload.avatar_url,
    )
    await db.commit()
    return {"ok": True, "artist": artist}


@router.get("", response_model=ArtistListResponse)
async def list_artists_endpoint(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None),
    _: object = Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    total, items = await list_artists(db, limit=limit, offset=offset, query=q)
    return {"ok": True, "items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/{artist_id}", response_model=ArtistDetailResponse)
async def artist_detail_endpoint(
    artist_id: int,
    _: object = Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    artist = await get_artist_detail(db, artist_id)
    return {"ok": True, "artist": artist}


@router.patch("/{artist_id}", response_model=ArtistDetailResponse)
async def artist_patch_endpoint(
    artist_id: int,
    payload: ArtistPatchRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    artist = await update_artist(
        db,
        artist_id=artist_id,
        updates=payload.model_dump(exclude_unset=True),
    )
    await db.commit()
    return {"ok": True, "artist": artist}


@router.delete("/{artist_id}", response_model=OkResponse)
async def artist_delete_endpoint(
    artist_id: int,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_artist(db, artist_id)
    await db.commit()
    return OkResponse()
