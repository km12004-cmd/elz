from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.admin import service
from app.modules.admin.schemas import (
    AdminUserDetailResponse,
    AdminUserListResponse,
    AdminXpResponse,
    AssignRoleRequest,
    GrantPremiumRequest,
    OkResponse,
    SetXpRequest,
)
from app.modules.auth.dependencies import require_admin_user

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users", response_model=AdminUserListResponse)
async def list_users_endpoint(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None),
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    total, items = await service.list_users(db, limit=limit, offset=offset, query=q)
    return {"ok": True, "items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/users/{user_id}", response_model=AdminUserDetailResponse)
async def get_user_endpoint(
    user_id: int,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = await service.get_user_detail(db, user_id)
    return {"ok": True, "user": user}


@router.patch("/users/{user_id}/role", response_model=AdminUserDetailResponse)
async def assign_role_endpoint(
    user_id: int,
    payload: AssignRoleRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = await service.assign_role(db, user_id, payload.role)
    await db.commit()
    return {"ok": True, "user": user}


@router.post("/users/{user_id}/premium", response_model=OkResponse)
async def grant_premium_endpoint(
    user_id: int,
    payload: GrantPremiumRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    await service.grant_premium(db, user_id, days=payload.days, plan_code=payload.plan_code)
    await db.commit()
    return OkResponse()


@router.delete("/users/{user_id}/premium", response_model=OkResponse)
async def revoke_premium_endpoint(
    user_id: int,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    await service.revoke_premium(db, user_id)
    await db.commit()
    return OkResponse()


@router.put("/users/{user_id}/xp", response_model=AdminXpResponse)
async def set_xp_endpoint(
    user_id: int,
    payload: SetXpRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await service.set_user_xp(db, user_id, payload.experience)
    await db.commit()
    return {"ok": True, **result}
