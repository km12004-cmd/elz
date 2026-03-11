from datetime import datetime

from pydantic import BaseModel


class RegisterRequest(BaseModel):
    first_name: str
    last_name: str
    nickname: str
    email: str
    password: str
    gender: str
    birth_date: str


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterResponse(BaseModel):
    ok: bool = True
    user_id: int


class AuthTokenResponse(BaseModel):
    ok: bool = True
    token_type: str = "bearer"
    access_token: str
    access_expires_at: str


class OkResponse(BaseModel):
    ok: bool = True


class AuthMeUser(BaseModel):
    id: int
    email: str
    created_at: str
    role: str
    nickname: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    gender: str | None = None
    birth_date: str | None = None


class AuthMeResponse(BaseModel):
    ok: bool = True
    user: AuthMeUser
