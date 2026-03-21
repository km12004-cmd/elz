from typing import Literal

from pydantic import BaseModel, Field, model_validator


class StartLearningResponse(BaseModel):
    track_id: int
    unlocked_level: int
    unlocked_game: int
    folder_id: int
    cards_added: int
    cards_existing: int


class LearningStateResponse(BaseModel):
    status: Literal["not_started", "listened", "learning", "finished"]
    unlocked_level: int
    unlocked_game: int
    folder_id: int | None = None


class FlashcardTemplateItem(BaseModel):
    id: int | None = None
    level: int
    kg_text: str
    ru_text: str
    order: int


class FlashcardTemplateCreateItem(BaseModel):
    kg_text: str
    ru_text: str
    order: int = Field(default=1, ge=1)
    level: int = Field(default=1, ge=1)


class FlashcardTemplateBulkCreateRequest(BaseModel):
    items: list[FlashcardTemplateCreateItem]

    @model_validator(mode="after")
    def validate_non_empty(self):
        if not self.items:
            raise ValueError("items cannot be empty")
        return self


class FlashcardTemplateBulkCreateResponse(BaseModel):
    track_id: int
    created_ids: list[int]
    created_count: int


class MarkListenedRequest(BaseModel):
    percent: int | None = Field(default=None, ge=0, le=100)
    seconds_listened: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_payload(self):
        if self.percent is None and self.seconds_listened is None:
            raise ValueError("provide percent or seconds_listened")
        return self


class MarkListenedResponse(BaseModel):
    track_id: int
    status: Literal["listened", "learning", "finished"]
    unlocked_level: int
    unlocked_game: int
    folder_id: int | None = None


class TrackLevelCardsResponse(BaseModel):
    track_id: int
    level: int
    items: list[FlashcardTemplateItem]


class DeleteTemplatesResponse(BaseModel):
    track_id: int
    deleted_count: int
