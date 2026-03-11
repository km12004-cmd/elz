import pytest
from fastapi import HTTPException

from app.modules.artists.service import _normalize_artist_name, _normalize_avatar_url


def test_normalize_artist_name_rejects_blank_value():
    with pytest.raises(HTTPException) as exc:
        _normalize_artist_name("   ")
    assert exc.value.status_code == 400
    assert exc.value.detail == "name is required"


def test_normalize_avatar_url_accepts_http_and_https():
    value_http = "http://example.com/avatar.png"
    value_https = "https://cdn.example.com/a.webp"
    assert _normalize_avatar_url(value_http) == value_http
    assert _normalize_avatar_url(value_https) == value_https


def test_normalize_avatar_url_returns_none_for_empty_values():
    assert _normalize_avatar_url("   ") is None
    assert _normalize_avatar_url(None) is None


def test_normalize_avatar_url_rejects_invalid_scheme():
    with pytest.raises(HTTPException) as exc:
        _normalize_avatar_url("ftp://example.com/avatar.png")
    assert exc.value.status_code == 400
    assert exc.value.detail == "avatar_url must start with http:// or https://"


def test_normalize_avatar_url_rejects_missing_host():
    with pytest.raises(HTTPException) as exc:
        _normalize_avatar_url("https:///avatar.png")
    assert exc.value.status_code == 400
    assert exc.value.detail == "avatar_url must include a host"
