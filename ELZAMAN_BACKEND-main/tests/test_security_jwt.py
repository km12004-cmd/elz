from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.security import (
    create_access_token,
    create_refresh_token,
    is_valid_jwt_format,
    parse_access_token,
    parse_refresh_token,
)
from app.modules.auth.dependencies import extract_bearer_token


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _request_with_auth(header: str | None) -> Request:
    scope = {"type": "http", "headers": []}
    if header is not None:
        scope["headers"] = [(b"authorization", header.encode("utf-8"))]
    return Request(scope)


def test_access_token_roundtrip():
    token, expires_at = create_access_token(123)
    assert isinstance(token, str)
    assert is_valid_jwt_format(token)
    assert parse_access_token(token) == 123
    assert expires_at > _utcnow()


def test_refresh_token_roundtrip():
    token, expires_at = create_refresh_token(77, "refresh-jti-1")
    payload = parse_refresh_token(token)
    assert payload is not None
    assert payload["user_id"] == 77
    assert payload["refresh_id"] == "refresh-jti-1"
    assert expires_at > _utcnow()


def test_access_parser_rejects_refresh_token():
    refresh_token, _ = create_refresh_token(5, "refresh-jti-2")
    assert parse_access_token(refresh_token) is None


def test_refresh_parser_rejects_access_token():
    access_token, _ = create_access_token(5)
    assert parse_refresh_token(access_token) is None


def test_access_parser_rejects_tampered_token():
    token, _ = create_access_token(42)
    header, payload, signature = token.split(".")
    replacement = "a" if signature[0] != "a" else "b"
    tampered_signature = replacement + signature[1:]
    tampered = ".".join([header, payload, tampered_signature])
    assert parse_access_token(tampered) is None


def test_extract_bearer_token_strict_success():
    token, _ = create_access_token(101)
    request = _request_with_auth(f"Bearer {token}")
    assert extract_bearer_token(request) == token


@pytest.mark.parametrize(
    "header",
    [
        "bearer token",
        "Bearer  token",
        " Bearer token",
        "Bearer b'abc.def.ghi'",
        "Bearer \"abc.def.ghi\"",
        "Token abc.def.ghi",
    ],
)
def test_extract_bearer_token_rejects_invalid_headers(header: str):
    with pytest.raises(HTTPException):
        extract_bearer_token(_request_with_auth(header))
