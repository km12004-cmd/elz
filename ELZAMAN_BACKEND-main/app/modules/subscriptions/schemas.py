from pydantic import BaseModel


class TelegramCheckoutLinkResponse(BaseModel):
    ok: bool = True
    request_id: int
    url: str
