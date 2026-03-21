from pydantic import BaseModel, Field, model_validator


class ExerciseTemplateItem(BaseModel):
    id: int
    exercise: int
    level: int | None = None
    kg_text: str
    ru_text: str
    order: int


class ExerciseTemplateCreateItem(BaseModel):
    kg_text: str
    ru_text: str
    order: int = Field(default=1, ge=1)
    level: int | None = Field(default=None, ge=1)


class ExerciseTemplateBulkCreateRequest(BaseModel):
    items: list[ExerciseTemplateCreateItem]

    @model_validator(mode="after")
    def validate_non_empty(self):
        if not self.items:
            raise ValueError("items cannot be empty")
        return self


class ExerciseTemplateBulkCreateResponse(BaseModel):
    track_id: int
    exercise: int
    created_ids: list[int]
    created_count: int
