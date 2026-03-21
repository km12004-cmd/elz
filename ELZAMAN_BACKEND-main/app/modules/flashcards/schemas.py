from pydantic import AliasChoices, BaseModel, Field, field_validator


class FlashcardDueItem(BaseModel):
    flashcard_id: int
    prompt_text: str
    answer_text: str
    source_type: str
    stage: int
    next_due_at: str


class FlashcardsDueResponse(BaseModel):
    ok: bool = True
    items: list[FlashcardDueItem]


class FlashcardReviewRequest(BaseModel):
    correct: bool


class FlashcardReviewResponse(BaseModel):
    ok: bool = True
    flashcard_id: int
    stage: int
    next_due_at: str


class OkResponse(BaseModel):
    ok: bool = True


class FolderCreate(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=60,
        validation_alias=AliasChoices("title", "name", "folder_name"),
    )

    @field_validator("title")
    @classmethod
    def _validate_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("title cannot be empty")
        return normalized


class FolderOut(BaseModel):
    id: int
    title: str
    cards_count: int


class FolderListOut(BaseModel):
    ok: bool = True
    folders: list[FolderOut]


class FolderCreateOut(BaseModel):
    ok: bool = True
    folder_id: int


class CardCreate(BaseModel):
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=500)

    @field_validator("front", "back")
    @classmethod
    def _validate_sides(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("card side cannot be empty")
        return normalized


class CardCreateOut(BaseModel):
    ok: bool = True
    card_id: int


class CardOut(BaseModel):
    id: int
    front: str
    back: str
    created_at: str


class FolderDetail(BaseModel):
    id: int
    title: str


class FolderDetailOut(BaseModel):
    ok: bool = True
    folder: FolderDetail
    cards: list[CardOut]
