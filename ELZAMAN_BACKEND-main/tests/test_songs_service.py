from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.modules.songs.service import _normalize_youtube_url, _serialize_song


def test_normalize_youtube_url_accepts_youtube_domain():
    value = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert _normalize_youtube_url(value) == value


def test_normalize_youtube_url_accepts_youtu_be_domain():
    value = "https://youtu.be/dQw4w9WgXcQ"
    assert _normalize_youtube_url(value) == value


def test_normalize_youtube_url_returns_none_for_empty_value():
    assert _normalize_youtube_url("   ") is None
    assert _normalize_youtube_url(None) is None


def test_normalize_youtube_url_rejects_non_youtube_domain():
    with pytest.raises(HTTPException) as exc:
        _normalize_youtube_url("https://example.com/song")
    assert exc.value.status_code == 400
    assert exc.value.detail == "youtube_url must point to youtube.com or youtu.be"


def test_normalize_youtube_url_rejects_invalid_scheme():
    with pytest.raises(HTTPException) as exc:
        _normalize_youtube_url("ftp://youtube.com/watch?v=123")
    assert exc.value.status_code == 400
    assert exc.value.detail == "youtube_url must start with http:// or https://"


def _song_stub():
    return SimpleNamespace(
        id=1,
        title="Song",
        lyrics_text="Lyrics",
        lyrics_text_ru=None,
        original_language="ru",
        release_year=2020,
        duration_seconds=180,
        is_published=True,
        created_at=datetime.now(timezone.utc),
    )


def test_serialize_song_sets_youtube_url_for_youtube_provider():
    payload = _serialize_song(
        _song_stub(),
        "Author",
        "https://www.youtube.com/watch?v=abc",
        "youtube",
    )
    assert payload["youtube_url"] == "https://www.youtube.com/watch?v=abc"


def test_serialize_song_hides_youtube_url_for_non_youtube_provider():
    payload = _serialize_song(
        _song_stub(),
        "Author",
        "https://cdn.example.com/audio.mp3",
        "s3",
    )
    assert payload["youtube_url"] is None
