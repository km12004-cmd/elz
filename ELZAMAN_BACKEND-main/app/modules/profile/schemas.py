from pydantic import BaseModel


class NicknameUpdateRequest(BaseModel):
    nickname: str


class TimezoneUpdateRequest(BaseModel):
    timezone: str


class DeleteAccountRequest(BaseModel):
    password: str


class ProfileUser(BaseModel):
    id: int
    email: str
    created_at: str
    role: str
    nickname: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    gender: str | None = None
    birth_date: str | None = None
    level: int
    experience: int
    level_progress_xp: int
    level_need_xp: int
    progress_percent: int
    is_premium: bool
    timezone: str
    timezone_changed_at: str | None = None
    streak_current: int
    streak_best: int
    streak_last_local_date: str | None = None
    deletion_status: str
    delete_effective_at: str | None = None


class ProfileResponse(BaseModel):
    ok: bool = True
    user: ProfileUser


class OkResponse(BaseModel):
    ok: bool = True
