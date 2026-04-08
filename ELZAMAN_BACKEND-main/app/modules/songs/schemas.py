from datetime import datetime

from pydantic import BaseModel


class SongCreateRequest(BaseModel):
    title: str
    author: str
    lyrics_text: str
    lyrics_text_ru: str | None = None
    youtube_url: str | None = None
    audio_url: str | None = None
    original_language: str = "und"
    release_year: int | None = None
    duration_seconds: int | None = None
    is_published: bool = True
    artist_id: int | None = None


class SongPatchRequest(BaseModel):
    title: str | None = None
    author: str | None = None
    lyrics_text: str | None = None
    lyrics_text_ru: str | None = None
    youtube_url: str | None = None
    original_language: str | None = None
    release_year: int | None = None
    duration_seconds: int | None = None
    is_published: bool | None = None


class SongItem(BaseModel):
    id: int
    title: str
    author: str
    lyrics_text: str
    lyrics_text_ru: str | None = None
    original_language: str
    release_year: int | None = None
    duration_seconds: int | None = None
    is_published: bool
    youtube_url: str | None = None
    audio_url: str | None = None
    created_at: datetime


class SongCreateResponse(BaseModel):
    ok: bool = True
    song: SongItem


class SongDetailResponse(BaseModel):
    ok: bool = True
    song: SongItem


class SongListResponse(BaseModel):
    ok: bool = True
    items: list[SongItem]
    total: int
    limit: int
    offset: int


class SongLyricsResponse(BaseModel):
    ok: bool = True
    song_id: int
    lyrics_text: str
    lyrics_text_ru: str | None = None


class OkResponse(BaseModel):
    ok: bool = True

