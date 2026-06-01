import base64
import hashlib
import hmac
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from passlib.context import CryptContext

from app.core.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_PATTERN = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")


def _settings():
    return get_settings()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _ensure_bcrypt_limit(password: str) -> None:
    if len(password.encode("utf-8")) > 72:
        raise ValueError("password too long for bcrypt (max 72 bytes)")


def hash_password(password: str) -> str:
    _ensure_bcrypt_limit(password)
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    _ensure_bcrypt_limit(password)
    return pwd_context.verify(password, password_hash)


def validate_password(password: str) -> tuple[bool, str]:
    if len(password.encode("utf-8")) > 72:
        return False, "password too long (bcrypt limit is 72 bytes)"
    if len(password) < 5:
        return False, "password must be at least 5 characters"

    has_letter = bool(re.search(r"[A-Za-z\u0400-\u04FF]", password))
    digits = re.findall(r"\d", password)
    has_special = bool(re.search(r"[^A-Za-z0-9\u0400-\u04FF]", password))

    if not has_letter:
        return False, "password must include letters"
    if len(digits) < 2:
        return False, "password must include at least 2 digits"
    if not has_special:
        return False, "password must include at least 1 special char"

    return True, ""


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _encode_jwt(payload: dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_part = _b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    payload_part = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    signature = hmac.new(_settings().jwt_secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    signature_part = _b64url_encode(signature)
    return f"{header_part}.{payload_part}.{signature_part}"


def is_valid_jwt_format(token: str) -> bool:
    return isinstance(token, str) and JWT_PATTERN.fullmatch(token) is not None


def _decode_jwt(token: str) -> dict[str, Any]:
    if not is_valid_jwt_format(token):
        raise ValueError("invalid token format")

    header_part, payload_part, signature_part = token.split(".")
    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    expected_signature = hmac.new(
        _settings().jwt_secret_key.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    actual_signature = _b64url_decode(signature_part)
    if not hmac.compare_digest(expected_signature, actual_signature):
        raise ValueError("invalid token signature")

    header = json.loads(_b64url_decode(header_part).decode("utf-8"))
    if header.get("alg") != "HS256":
        raise ValueError("unsupported jwt algorithm")

    payload = json.loads(_b64url_decode(payload_part).decode("utf-8"))
    exp = payload.get("exp")
    if not isinstance(exp, int):
        raise ValueError("invalid token exp")
    if exp <= int(_utcnow().timestamp()):
        raise ValueError("token expired")

    return payload


def create_access_token(user_id: int) -> tuple[str, datetime]:
    now = _utcnow()
    expires_at = now + timedelta(minutes=_settings().access_token_ttl_minutes)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iss": _settings().jwt_issuer,
        "aud": _settings().jwt_access_audience,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = _encode_jwt(payload)
    if not is_valid_jwt_format(token):
        raise ValueError("access token is not URL-safe JWT")
    return token, expires_at


def parse_access_token(token: str) -> int | None:
    if not is_valid_jwt_format(token):
        return None
    try:
        payload = _decode_jwt(token)
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None

    if payload.get("type") != "access":
        return None
    if payload.get("iss") != _settings().jwt_issuer:
        return None
    if payload.get("aud") != _settings().jwt_access_audience:
        return None

    user_id_raw = payload.get("sub")
    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError):
        return None
    if user_id <= 0:
        return None

    return user_id


def create_refresh_token(user_id: int, refresh_id: str) -> tuple[str, datetime]:
    now = _utcnow()
    expires_at = now + timedelta(days=_settings().refresh_token_ttl_days)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": refresh_id,
        "iss": _settings().jwt_issuer,
        "aud": _settings().jwt_refresh_audience,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = _encode_jwt(payload)
    if not is_valid_jwt_format(token):
        raise ValueError("refresh token is not URL-safe JWT")
    return token, expires_at


def parse_refresh_token(token: str) -> dict[str, Any] | None:
    if not is_valid_jwt_format(token):
        return None
    try:
        payload = _decode_jwt(token)
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None

    if payload.get("type") != "refresh":
        return None
    if payload.get("iss") != _settings().jwt_issuer:
        return None
    if payload.get("aud") != _settings().jwt_refresh_audience:
        return None

    refresh_id = payload.get("jti")
    user_id_raw = payload.get("sub")
    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError):
        return None
    if user_id <= 0 or not isinstance(refresh_id, str) or not refresh_id:
        return None

    return {"user_id": user_id, "refresh_id": refresh_id}


def generate_code() -> str:
    return f"{secrets.randbelow(10 ** 6):06d}"


def expires_in_minutes(minutes: int) -> datetime:
    return _utcnow() + timedelta(minutes=minutes)
