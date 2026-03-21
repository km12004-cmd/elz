from datetime import datetime

from pydantic import BaseModel


class PlaylistCreateRequest(BaseModel):
    title: str
    description: str | None = None


class PlaylistSummary(BaseModel):
    id: int
    title: str
    description: str | None = None


class PlaylistSong(BaseModel):
    id: int
    title: str
    audio_url: str | None = None
    position: int
    added_at: datetime


class AvailableSong(BaseModel):
    id: int
    title: str
    audio_url: str | None = None


class PlaylistsResponse(BaseModel):
    ok: bool = True
    playlists: list[PlaylistSummary]


class PlaylistCreateResponse(BaseModel):
    ok: bool = True
    playlist_id: int


class PlaylistSongAddRequest(BaseModel):
    song_id: int


class PlaylistSongAddResponse(BaseModel):
    ok: bool = True
    playlist_id: int
    song_id: int
    position: int
    added_at: datetime


class PlaylistSongsResponse(BaseModel):
    ok: bool = True
    songs: list[PlaylistSong]


class PlaylistDetailResponse(BaseModel):
    ok: bool = True
    playlist: PlaylistSummary
    songs: list[PlaylistSong]
    available_songs: list[AvailableSong]


class OkResponse(BaseModel):
    ok: bool = True
