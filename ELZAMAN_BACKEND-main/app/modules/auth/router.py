import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    parse_refresh_token,
)
from app.db.models import User
from app.db.session import get_db
from app.modules.auth import crud, service
from app.modules.auth.dependencies import (
    clear_refresh_cookie,
    clear_session_cookie,
    ensure_user_not_pending_delete,
    extract_refresh_token,
    parse_refresh_payload,
    require_current_user,
    set_refresh_cookie,
    set_session_cookie,
)
from app.modules.auth.schemas import (
    AuthMeResponse,
    AuthTokenResponse,
    LoginRequest,
    OkResponse,
    RegisterRequest,
    RegisterResponse,
)
from app.utils.datetime import to_iso

router = APIRouter(prefix="/auth", tags=["Auth"])


def _unauthorized_response() -> JSONResponse:
    response = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"ok": False, "error": "unauthorized"},
    )
    clear_refresh_cookie(response)
    return response


@router.post("/register", response_model=RegisterResponse)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    first_name = payload.first_name.strip()
    last_name = payload.last_name.strip()
    nickname = payload.nickname.strip()
    email = payload.email.strip().lower()
    password = payload.password.strip()
    gender = payload.gender.strip().lower()
    birth_date_raw = payload.birth_date.strip()

    birth_date = await service.assert_register_payload(
        first_name=first_name,
        last_name=last_name,
        nickname=nickname,
        email=email,
        password=password,
        gender=gender,
        birth_date_raw=birth_date_raw,
    )

    await service.assert_unique_email_and_nickname(db, email, nickname)

    user = await crud.create_user(
        db,
        first_name=first_name,
        last_name=last_name,
        nickname=nickname,
        email=email,
        password_hash=hash_password(password),
        locale=get_settings().default_locale,
        gender=gender,
        birth_date=birth_date,
    )
    await db.commit()
    await db.refresh(user)

    return RegisterResponse(user_id=user.id)


@router.post("/login", response_model=AuthTokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    email = payload.email.strip().lower()
    password = payload.password.strip()

    user = await crud.get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "INVALID_CREDENTIALS",
                "message": "Неверный email или пароль",
            },
        )
    ensure_user_not_pending_delete(user)

    try:
        service.assert_password_or_raise(password, user.password_hash)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "INVALID_CREDENTIALS",
                "message": "Неверный email или пароль",
            },
        )

    access_token, access_expires_at = create_access_token(user.id)
    refresh_id = uuid.uuid4().hex
    refresh_token, refresh_expires_at = create_refresh_token(user.id, refresh_id)

    session_id = uuid.uuid4().hex
    session_expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7)

    await crud.create_session(db, session_id, user.id, session_expires_at)
    await crud.create_refresh_session(
        db,
        refresh_id=refresh_id,
        user_id=user.id,
        expires_at=refresh_expires_at,
    )
    await db.commit()

    response = JSONResponse(content=service.auth_success_payload(access_token, access_expires_at))
    set_session_cookie(response, session_id)
    set_refresh_cookie(response, refresh_token)
    return response


@router.post("/logout", response_model=OkResponse)
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    session_id = request.cookies.get(get_settings().cookie_name)
    refresh_token = extract_refresh_token(request)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    changed = False

    if session_id:
        await crud.delete_session(db, session_id)
        changed = True

    if refresh_token:
        payload = parse_refresh_token(refresh_token)
        if payload:
            revoked = await crud.revoke_refresh_session(
                db,
                user_id=payload["user_id"],
                refresh_id=payload["refresh_id"],
                now=now,
            )
            changed = changed or revoked

    if changed:
        await db.commit()

    response = JSONResponse(content={"ok": True})
    clear_session_cookie(response)
    clear_refresh_cookie(response)
    return response


@router.post("/refresh", response_model=AuthTokenResponse)
async def refresh(request: Request, db: AsyncSession = Depends(get_db)):
    refresh_token = extract_refresh_token(request)
    if not refresh_token:
        return _unauthorized_response()

    try:
        payload = parse_refresh_payload(refresh_token)
    except HTTPException:
        return _unauthorized_response()

    user_id = int(payload["user_id"])
    refresh_id = str(payload["refresh_id"])
    user = await db.get(User, user_id)
    if not user:
        return _unauthorized_response()
    try:
        ensure_user_not_pending_delete(user)
    except HTTPException:
        response = JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"ok": False, "error": "account pending deletion"},
        )
        clear_refresh_cookie(response)
        return response

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    revoked = await crud.revoke_refresh_session(
        db,
        user_id=user_id,
        refresh_id=refresh_id,
        now=now,
        require_unexpired=True,
    )
    if not revoked:
        return _unauthorized_response()

    access_token, access_expires_at = create_access_token(user_id)
    new_refresh_id = uuid.uuid4().hex
    new_refresh_token, new_refresh_expires_at = create_refresh_token(user_id, new_refresh_id)

    await crud.create_refresh_session(
        db,
        refresh_id=new_refresh_id,
        user_id=user_id,
        expires_at=new_refresh_expires_at,
        rotated_from=refresh_id,
    )
    await db.commit()

    response = JSONResponse(content=service.auth_success_payload(access_token, access_expires_at))
    set_refresh_cookie(response, new_refresh_token)
    return response


@router.get("/me", response_model=AuthMeResponse)
async def me(user=Depends(require_current_user)):
    return {
        "ok": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "created_at": to_iso(user.created_at),
            "role": user.role,
            "nickname": user.nickname,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "gender": user.gender,
            "birth_date": str(user.birth_date) if user.birth_date else None,
        },
    }
