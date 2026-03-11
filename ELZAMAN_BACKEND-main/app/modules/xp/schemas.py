from pydantic import BaseModel


class ProgressResponse(BaseModel):
    ok: bool
    level: int
    xp_total: int
    next_level: int
    next_level_threshold: int
    xp_to_next_level: int


class OpenSongResponse(BaseModel):
    ok: bool
    session_id: str


class CompleteSongResponse(BaseModel):
    ok: bool
    song_id: int
    applied: bool
    xp_delta: int
    new_xp: int | None
    new_level: int | None
    next_level_threshold: int | None = None
    xp_to_next_level: int | None = None
