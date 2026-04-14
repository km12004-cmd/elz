import secrets
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import Song, SubscriptionPurchaseRequest, User, UserSubscription

PURCHASE_STATUS_AWAITING_START = "awaiting_start"
PURCHASE_STATUS_AWAITING_ACCEPTANCE = "awaiting_acceptance"
PURCHASE_STATUS_AWAITING_EMAIL = "awaiting_email"
PURCHASE_STATUS_AWAITING_RECEIPT = "awaiting_receipt"
PURCHASE_STATUS_SUBMITTED = "submitted"
PURCHASE_STATUS_APPROVED = "approved"
PURCHASE_STATUS_REJECTED = "rejected"
PURCHASE_STATUS_EXPIRED = "expired"

OPEN_PURCHASE_STATUSES = {
    PURCHASE_STATUS_AWAITING_START,
    PURCHASE_STATUS_AWAITING_ACCEPTANCE,
    PURCHASE_STATUS_AWAITING_EMAIL,
    PURCHASE_STATUS_AWAITING_RECEIPT,
}
PREMIUM_LOCKED_SONGS_COUNT = 4
PREMIUM_STUDY_ACCESS_REQUIRED_DETAIL = "premium subscription is required to study this song"


def normalize_email(value: str) -> str:
    return value.strip().lower()


def is_telegram_checkout_enabled() -> bool:
    settings = get_settings()
    return bool(settings.telegram_bot_token and settings.telegram_bot_username)


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


async def ensure_song_study_access(db: AsyncSession, user: User, song_id: int) -> None:
    if user.is_admin():
        return

    if await is_premium_user(db, user.id):
        return

    locked_result = await db.execute(
        select(Song.id)
        .order_by(Song.created_at.desc(), Song.id.desc())
        .limit(PREMIUM_LOCKED_SONGS_COUNT)
    )
    locked_song_ids = {int(row[0]) for row in locked_result.all() if row and row[0] is not None}
    if int(song_id) in locked_song_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=PREMIUM_STUDY_ACCESS_REQUIRED_DETAIL,
        )


async def create_telegram_checkout_link(db: AsyncSession, user: User) -> dict[str, int | str]:
    settings = get_settings()
    if not is_telegram_checkout_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="telegram checkout is not configured",
        )

    if await is_premium_user(db, user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="premium subscription is already active",
        )

    now = datetime.utcnow()
    result = await db.execute(
        select(SubscriptionPurchaseRequest).where(
            SubscriptionPurchaseRequest.user_id == user.id,
            SubscriptionPurchaseRequest.status.in_(OPEN_PURCHASE_STATUSES),
        )
    )
    for request in result.scalars().all():
        request.status = PURCHASE_STATUS_EXPIRED
        request.updated_at = now

    purchase_request = SubscriptionPurchaseRequest(
        user_id=user.id,
        start_token=secrets.token_urlsafe(24),
        site_email=normalize_email(user.email),
        status=PURCHASE_STATUS_AWAITING_START,
        created_at=now,
        updated_at=now,
    )
    db.add(purchase_request)
    await db.flush()

    return {
        "request_id": purchase_request.id,
        "url": f"https://t.me/{settings.telegram_bot_username}?start={purchase_request.start_token}",
    }


async def get_purchase_request_by_start_token(
    db: AsyncSession,
    start_token: str,
) -> SubscriptionPurchaseRequest | None:
    result = await db.execute(
        select(SubscriptionPurchaseRequest).where(SubscriptionPurchaseRequest.start_token == start_token)
    )
    return result.scalar_one_or_none()


async def get_purchase_request_by_id(
    db: AsyncSession,
    request_id: int,
) -> SubscriptionPurchaseRequest | None:
    return await db.get(SubscriptionPurchaseRequest, request_id)


async def get_latest_chat_purchase_request(
    db: AsyncSession,
    telegram_chat_id: int,
) -> SubscriptionPurchaseRequest | None:
    result = await db.execute(
        select(SubscriptionPurchaseRequest)
        .where(SubscriptionPurchaseRequest.telegram_chat_id == telegram_chat_id)
        .order_by(SubscriptionPurchaseRequest.updated_at.desc(), SubscriptionPurchaseRequest.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
