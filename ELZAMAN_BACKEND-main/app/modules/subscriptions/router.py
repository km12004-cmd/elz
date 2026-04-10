from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.dependencies import require_current_user
from app.modules.subscriptions.schemas import TelegramCheckoutLinkResponse
from app.modules.subscriptions.service import create_telegram_checkout_link

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])


@router.post("/telegram-link", response_model=TelegramCheckoutLinkResponse)
async def create_telegram_checkout_link_endpoint(
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    payload = await create_telegram_checkout_link(db, user)
    await db.commit()
    return {"ok": True, **payload}
