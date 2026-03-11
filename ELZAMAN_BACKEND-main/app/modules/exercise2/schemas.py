from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Game2PairTemplateItem(BaseModel):
    id: int
    exercise: int
    kg_text: str
    ru_text: str
    order: int


class Game2PairTemplateCreateItem(BaseModel):
    kg_text: str
    ru_text: str
    order: int = Field(default=1, ge=1)


class Game2PairTemplateBulkCreateRequest(BaseModel):
    items: list[Game2PairTemplateCreateItem]

    @model_validator(mode="after")
    def validate_non_empty(self):
        if not self.items:
            raise ValueError("items cannot be empty")
        return self


class Game2PairTemplateBulkCreateResponse(BaseModel):
    track_id: int
    exercise: int
    created_ids: list[int]
    created_count: int


class Game2StartItem(BaseModel):
    pair_id: int
    left: str


class Game2Option(BaseModel):
    option_id: int
    text: str


class Game2StartResponse(BaseModel):
    session_id: str
    track_id: int
    exercise: int
    items: list[Game2StartItem]
    options: list[Game2Option]


class Game2AnswerRequest(BaseModel):
    pair_id: int = Field(ge=1)
    option_id: int = Field(ge=1)


class Game2AnswerResponse(BaseModel):
    pair_id: int
    option_id: int
    correct: bool


class Game2FinishResponse(BaseModel):
    exercise: int
    correct: int
    total: int
    passed: bool
    xp_applied: bool = False
    xp_delta: int = 0
    new_xp: int | None = None
    new_level: int | None = None
    next_level_threshold: int | None = None
    xp_to_next_level: int | None = None


class Game2SessionAnswer(BaseModel):
    pair_id: int
    option_id: int
    correct: bool
    answered_at: str


class Game2SessionStatusResponse(BaseModel):
    session_id: str
    track_id: int
    exercise: int
    status: Literal["in_progress", "completed", "abandoned"]
    answered_count: int
    total: int
    remaining: int
    answers: list[Game2SessionAnswer]
