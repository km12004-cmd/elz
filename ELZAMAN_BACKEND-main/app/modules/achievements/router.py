from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.achievements.schemas import AchievementsResponse
from app.modules.achievements.service import check_and_persist_achievements
from app.modules.auth.dependencies import require_current_user

router = APIRouter(prefix="/achievements", tags=["Achievements"])


@router.get("", response_model=AchievementsResponse)
async def get_achievements(
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    achievements = await check_and_persist_achievements(db, user.id, user)
    await db.commit()
    return {"achievements": achievements}
