from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.telegram.service import process_update, verify_webhook_secret

router = APIRouter(prefix="/telegram", tags=["Telegram"])


@router.post("/webhook")
async def telegram_webhook_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    verify_webhook_secret(x_telegram_bot_api_secret_token)
    update = await request.json()
    if isinstance(update, dict):
        await process_update(db, update)
    return {"ok": True}
