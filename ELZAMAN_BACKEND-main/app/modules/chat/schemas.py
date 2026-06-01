from pydantic import BaseModel, Field, field_validator


class ChatHistoryMessage(BaseModel):
    role: str
    content: str = Field(max_length=1000)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"user", "assistant"}:
            raise ValueError("role must be user or assistant")
        return normalized

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("content is required")
        return normalized


class ChatMessageRequest(BaseModel):
    message: str = Field(max_length=1000)
    history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=6)

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("message is required")
        return normalized


class ChatMessageResponse(BaseModel):
    ok: bool = True
    answer: str
