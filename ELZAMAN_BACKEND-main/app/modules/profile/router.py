from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.dependencies import require_current_user
from app.modules.profile.schemas import (
    DeleteAccountRequest,
    NicknameUpdateRequest,
    OkResponse,
    ProfileResponse,
    TimezoneUpdateRequest,
)
from app.modules.profile.service import (
    build_profile_payload,
    request_account_deletion,
    update_nickname,
    update_timezone,
)

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("", response_model=ProfileResponse)
async def profile(user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    return {"ok": True, "user": await build_profile_payload(db, user)}


@router.post("/nickname", response_model=OkResponse)
async def profile_nickname(payload: NicknameUpdateRequest, user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    await update_nickname(db, user, payload.nickname)
    await db.commit()
    return OkResponse()


@router.post("/timezone", response_model=OkResponse)
async def profile_timezone(payload: TimezoneUpdateRequest, user=Depends(require_current_user), db: AsyncSession = Depends(get_db)):
    await update_timezone(user, payload.timezone)
    await db.commit()
    return OkResponse()


@router.post("/delete/request", response_model=OkResponse)
async def profile_delete_request(
    payload: DeleteAccountRequest,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    await request_account_deletion(db, user, payload.password)
    await db.commit()
    return OkResponse()
