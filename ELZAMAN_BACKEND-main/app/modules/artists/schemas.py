from datetime import datetime

from pydantic import BaseModel


class ArtistCreateRequest(BaseModel):
    name: str
    bio: str | None = None
    avatar_url: str | None = None


class ArtistPatchRequest(BaseModel):
    name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None


class ArtistItem(BaseModel):
    id: int
    name: str
    bio: str | None = None
    avatar_url: str | None = None
    created_at: datetime


class ArtistCreateResponse(BaseModel):
    ok: bool = True
    artist: ArtistItem


class ArtistDetailResponse(BaseModel):
    ok: bool = True
    artist: ArtistItem


class ArtistListResponse(BaseModel):
    ok: bool = True
    items: list[ArtistItem]
    total: int
    limit: int
    offset: int


class OkResponse(BaseModel):
    ok: bool = True
