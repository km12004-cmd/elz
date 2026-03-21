from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import UserSubscription


async def is_premium_user(db: AsyncSession, user_id: int) -> bool:
    result = await db.execute(
        select(UserSubscription).where(
            UserSubscription.user_id == user_id,
            UserSubscription.status == "active",
            UserSubscription.starts_at <= func.now(),
            UserSubscription.expires_at > func.now(),
        )
    )
    return result.scalar_one_or_none() is not None
