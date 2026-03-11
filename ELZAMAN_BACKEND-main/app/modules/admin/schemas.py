from pydantic import BaseModel


class AdminUserItem(BaseModel):
    id: int
    email: str
    nickname: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    role: str
    level: int
    experience: int
    is_premium: bool
    created_at: str
    deleted_at: str | None = None
    delete_requested_at: str | None = None


class AdminUserListResponse(BaseModel):
    ok: bool = True
    items: list[AdminUserItem]
    total: int
    limit: int
    offset: int


class AdminUserDetailResponse(BaseModel):
    ok: bool = True
    user: AdminUserItem


class AssignRoleRequest(BaseModel):
    role: str


class GrantPremiumRequest(BaseModel):
    days: int
    plan_code: str = "admin_grant"


class SetXpRequest(BaseModel):
    experience: int


class AdminXpResponse(BaseModel):
    ok: bool = True
    user_id: int
    experience: int
    level: int


class OkResponse(BaseModel):
    ok: bool = True
