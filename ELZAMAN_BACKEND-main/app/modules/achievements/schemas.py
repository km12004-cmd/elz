from pydantic import BaseModel


class AchievementOut(BaseModel):
    code: str
    title_en: str
    title_ru: str
    description_en: str
    description_ru: str
    category: str
    threshold: int
    xp_reward: int
    unlocked: bool
    unlocked_at: str | None = None


class AchievementsResponse(BaseModel):
    achievements: list[AchievementOut]
