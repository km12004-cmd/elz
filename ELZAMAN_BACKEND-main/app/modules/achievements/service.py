from sqlalchemy import exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    User,
    UserAchievement,
    UserFlashcardState,
    UserGameAnswer,
    UserGameSession,
    XpEvent,
)
from app.modules.achievements.definitions import ACHIEVEMENTS
from app.modules.xp.service import award_xp
from app.utils.datetime import utcnow


async def gather_user_stats(db: AsyncSession, user_id: int, user: User) -> dict[str, int]:
    total_xp = user.experience or 0
    streak_best = user.streak_best or 0

    songs_q = select(func.count()).select_from(XpEvent).where(
        XpEvent.user_id == user_id,
        XpEvent.event_type == "song_completed",
    )
    games_q = select(func.count()).select_from(UserGameSession).where(
        UserGameSession.user_id == user_id,
        UserGameSession.status == "completed",
    )
    cards_q = select(func.count()).select_from(UserFlashcardState).where(
        UserFlashcardState.user_id == user_id,
    )

    has_wrong = (
        select(UserGameAnswer.session_id)
        .where(
            UserGameAnswer.session_id == UserGameSession.id,
            UserGameAnswer.is_correct.is_(False),
        )
        .correlate(UserGameSession)
        .exists()
    )
    has_any = (
        select(UserGameAnswer.session_id)
        .where(UserGameAnswer.session_id == UserGameSession.id)
        .correlate(UserGameSession)
        .exists()
    )
    perfect_q = (
        select(func.count())
        .select_from(UserGameSession)
        .where(
            UserGameSession.user_id == user_id,
            UserGameSession.status == "completed",
            ~has_wrong,
            has_any,
        )
    )

    songs_completed = (await db.execute(songs_q)).scalar_one()
    games_completed = (await db.execute(games_q)).scalar_one()
    cards_reviewed = (await db.execute(cards_q)).scalar_one()
    perfect_games = (await db.execute(perfect_q)).scalar_one()

    return {
        "total_xp": total_xp,
        "streak_best": streak_best,
        "songs_completed": songs_completed,
        "games_completed": games_completed,
        "cards_reviewed": cards_reviewed,
        "perfect_games": perfect_games,
    }


async def check_and_persist_achievements(
    db: AsyncSession, user_id: int, user: User,
) -> list[dict]:
    stats = await gather_user_stats(db, user_id, user)

    rows = await db.execute(
        select(UserAchievement.achievement_code, UserAchievement.unlocked_at)
        .where(UserAchievement.user_id == user_id)
    )
    unlocked_map: dict[str, str] = {}
    for code, unlocked_at in rows:
        unlocked_map[code] = unlocked_at.isoformat() if unlocked_at else None

    result: list[dict] = []
    for ach in ACHIEVEMENTS:
        if ach.code in unlocked_map:
            result.append(_to_dict(ach, unlocked=True, unlocked_at=unlocked_map[ach.code]))
            continue

        value = stats.get(ach.stat_key, 0)
        if value >= ach.threshold:
            now = utcnow()
            try:
                async with db.begin_nested():
                    db.add(UserAchievement(
                        user_id=user_id,
                        achievement_code=ach.code,
                        unlocked_at=now,
                    ))
                    await db.flush()
            except IntegrityError:
                pass

            await award_xp(
                db,
                user_id=user_id,
                event_type="achievement",
                source_id=ach.code,
                dedupe_key=f"achievement:{ach.code}",
                xp_delta=ach.xp_reward,
            )
            result.append(_to_dict(ach, unlocked=True, unlocked_at=now.isoformat()))
        else:
            result.append(_to_dict(ach, unlocked=False, unlocked_at=None))

    return result


def _to_dict(ach, *, unlocked: bool, unlocked_at: str | None) -> dict:
    return {
        "code": ach.code,
        "title_en": ach.title_en,
        "title_ru": ach.title_ru,
        "description_en": ach.description_en,
        "description_ru": ach.description_ru,
        "category": ach.category,
        "threshold": ach.threshold,
        "xp_reward": ach.xp_reward,
        "unlocked": unlocked,
        "unlocked_at": unlocked_at,
    }
