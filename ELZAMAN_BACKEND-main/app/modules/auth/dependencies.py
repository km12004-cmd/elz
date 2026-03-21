import re
from datetime import datetime

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import parse_access_token, parse_refresh_token
from app.db.models import User
from app.db.session import get_db
from app.modules.auth import crud, service

_BEARER_HEADER_PATTERN = re.compile(r"^Bearer [^\s]+$")


def extract_bearer_token(request: Request) -> str | None:
    header = request.headers.get("Authorization")
    if header is None:
        return None

    if not isinstance(header, str) or header != header.strip() or not _BEARER_HEADER_PATTERN.fullmatch(header):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid authorization header")

    _, token = header.split(" ", 1)
    token = token.strip()

    if (
        not token
        or token.startswith("b\"")
        or token.startswith("b'")
        or token.startswith("\"")
        or token.startswith("'")
        or token.endswith("\"")
        or token.endswith("'")
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid access token format")

    return token


def extract_refresh_token(request: Request) -> str | None:
    token = request.cookies.get(get_settings().refresh_cookie_name, "").strip()
    if not token:
        return None
    return token


def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=get_settings().cookie_name,
        value=session_id,
        httponly=True,
        samesite="lax",
        secure=False,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(get_settings().cookie_name)


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=get_settings().refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/api",
        max_age=get_settings().refresh_token_ttl_days * 24 * 60 * 60,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(get_settings().refresh_cookie_name, path="/api")


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    token = extract_bearer_token(request)
    if token:
        user_id = parse_access_token(token)
        if user_id:
            user = await db.get(User, user_id)
            if user:
                ensure_user_not_pending_delete(user)
                if service.update_visit_streak(user):
                    await db.commit()
                return user
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")

    session_id = request.cookies.get(get_settings().cookie_name)
    if not session_id:
        return None

    session = await crud.get_session(db, session_id)
    if not session:
        return None

    if session.expires_at < datetime.utcnow():
        await crud.delete_session(db, session_id)
        await db.commit()
        return None

    user = await db.get(User, session.user_id)
    if user:
        ensure_user_not_pending_delete(user)
        if service.update_visit_streak(user):
            await db.commit()
    return user


async def require_current_user(user: User | None = Depends(get_current_user)) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")
    return user


async def require_admin_user(user: User = Depends(require_current_user)) -> User:
    if not user.is_admin():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin access required")
    return user


def parse_refresh_payload(token: str) -> dict[str, int | str]:
    payload = parse_refresh_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")
    return payload


def ensure_user_not_pending_delete(user: User) -> None:
    if user.deleted_at is not None or user.delete_requested_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="account pending deletion")
