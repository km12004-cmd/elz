from fastapi import APIRouter, Depends, Request

from app.core.config import Settings, get_settings
from app.modules.chat.schemas import ChatMessageRequest, ChatMessageResponse
from app.modules.chat import service

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/messages", response_model=ChatMessageResponse)
async def create_chat_message(
    payload: ChatMessageRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
):
    client_key = request.client.host if request.client else "unknown"
    service.assert_rate_limit(client_key)

    messages = service.build_messages(payload.history, payload.message)
    answer = await service.post_chat_completion(settings, messages)

    return ChatMessageResponse(answer=answer)
