import asyncio
import json
import re
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import SubscriptionPurchaseRequest
from app.modules.admin import service as admin_service
from app.modules.subscriptions.service import (
    PURCHASE_STATUS_APPROVED,
    PURCHASE_STATUS_AWAITING_ACCEPTANCE,
    PURCHASE_STATUS_AWAITING_EMAIL,
    PURCHASE_STATUS_AWAITING_RECEIPT,
    PURCHASE_STATUS_AWAITING_START,
    PURCHASE_STATUS_EXPIRED,
    PURCHASE_STATUS_REJECTED,
    PURCHASE_STATUS_SUBMITTED,
    get_latest_chat_purchase_request,
    get_purchase_request_by_id,
    get_purchase_request_by_start_token,
    normalize_email,
)

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CALLBACK_ACCEPT_PREFIX = "purchase:accept:"
CALLBACK_ADMIN_APPROVE_PREFIX = "admin:approve:"
CALLBACK_ADMIN_REJECT_PREFIX = "admin:reject:"


def _support_keyboard() -> dict[str, list[list[dict[str, str]]]]:
    return {
        "inline_keyboard": [
            [{"text": "Техподдержка / Support", "url": get_settings().telegram_support_url}],
        ]
    }


def _checkout_keyboard(request_id: int) -> dict[str, list[list[dict[str, str]]]]:
    return {
        "inline_keyboard": [
            [
                {
                    "text": "Я принимаю условия / I accept the terms",
                    "callback_data": f"{CALLBACK_ACCEPT_PREFIX}{request_id}",
                }
            ],
            [{"text": "Техподдержка / Support", "url": get_settings().telegram_support_url}],
        ]
    }


def _admin_review_keyboard(request_id: int) -> dict[str, list[list[dict[str, str]]]]:
    days = get_settings().telegram_premium_days
    return {
        "inline_keyboard": [
            [
                {"text": f"Approve {days}d", "callback_data": f"{CALLBACK_ADMIN_APPROVE_PREFIX}{request_id}"},
                {"text": "Reject", "callback_data": f"{CALLBACK_ADMIN_REJECT_PREFIX}{request_id}"},
            ]
        ]
    }


def _format_identity(request: SubscriptionPurchaseRequest) -> str:
    if request.telegram_username:
        return f"@{request.telegram_username}"
    if request.telegram_first_name:
        return request.telegram_first_name
    if request.telegram_user_id:
        return str(request.telegram_user_id)
    return "unknown"


def _warning_text() -> str:
    price_label = get_settings().telegram_premium_price_label
    return (
        "Оплата подписки происходит переводом по QR-коду.\n"
        f"Стоимость: {price_label}.\n"
        "После оплаты отправьте email, на который зарегистрирован аккаунт на сайте, и скриншот перевода.\n"
        "Проверка оплаты и выдача подписки могут занять до 24 часов.\n\n"
        "Payment is made by transfer using the QR code.\n"
        f"Price: {price_label}.\n"
        "After payment, send the email used on the website and the transfer screenshot.\n"
        "Payment review and subscription activation can take up to 24 hours."
    )


def _generic_start_text() -> str:
    return (
        "Откройте бота по кнопке покупки на сайте, чтобы привязать оплату к вашему аккаунту.\n\n"
        "Open this bot from the purchase button on the website so the payment can be linked to your account."
    )


def _payment_caption() -> str:
    price_label = get_settings().telegram_premium_price_label
    return (
        "Оплатите подписку по QR-коду ниже.\n"
        f"Сумма: {price_label}.\n\n"
        "Pay for the subscription using the QR code below.\n"
        f"Amount: {price_label}."
    )


def _email_prompt_text(site_email: str) -> str:
    return (
        "Отправьте email, на который зарегистрирован аккаунт на сайте.\n"
        f"Ожидаемый email: {site_email}\n\n"
        "Send the email used for your website account.\n"
        f"Expected email: {site_email}"
    )


def _receipt_prompt_text() -> str:
    return (
        "Теперь отправьте скриншот перевода в этот чат.\n\n"
        "Now send the payment screenshot in this chat."
    )


def _submitted_text() -> str:
    return (
        "Заявка отправлена админу. Проверка оплаты и выдача подписки могут занять до 24 часов.\n\n"
        "Your request was sent to the admin. Payment review and subscription activation can take up to 24 hours."
    )


def _approved_text() -> str:
    return (
        "Оплата подтверждена, премиум-подписка активирована.\n\n"
        "Payment confirmed, your premium subscription is now active."
    )


def _rejected_text() -> str:
    return (
        "Заявка отклонена. Если это ошибка, напишите в поддержку.\n\n"
        "The request was rejected. If this is a mistake, contact support."
    )


def _expired_text() -> str:
    return (
        "Эта ссылка для оплаты больше не активна. Вернитесь на сайт и нажмите кнопку покупки ещё раз.\n\n"
        "This payment link is no longer active. Go back to the website and start the purchase again."
    )


def _invalid_email_text() -> str:
    return (
        "Нужно отправить корректный email, на который зарегистрирован аккаунт на сайте.\n\n"
        "Please send the valid email used for your website account."
    )


def _email_mismatch_text(site_email: str) -> str:
    return (
        "Этот email не совпадает с аккаунтом на сайте.\n"
        f"Отправьте email: {site_email}\n\n"
        "This email does not match the website account.\n"
        f"Please send: {site_email}"
    )


def _need_email_first_text() -> str:
    return (
        "Сначала отправьте email, а потом скриншот перевода.\n\n"
        "Send the email first, then the payment screenshot."
    )


def _need_screenshot_text() -> str:
    return (
        "Нужен скриншот перевода. Отправьте изображение или фото.\n\n"
        "A payment screenshot is required. Please send an image."
    )


def _admin_notification_text(request: SubscriptionPurchaseRequest) -> str:
    return (
        "New premium payment request\n"
        f"Request ID: {request.id}\n"
        f"Site user ID: {request.user_id}\n"
        f"Site email: {request.site_email}\n"
        f"Provided email: {request.provided_email or '-'}\n"
        f"Telegram: {_format_identity(request)}\n"
        f"Telegram user ID: {request.telegram_user_id or '-'}"
    )


def _normalize_message_email(text: str) -> str | None:
    candidate = normalize_email(text)
    if not EMAIL_PATTERN.fullmatch(candidate):
        return None
    return candidate


def _extract_start_token(text: str | None) -> str | None:
    if not text:
        return None
    stripped = text.strip()
    if not stripped.startswith("/start"):
        return None

    parts = stripped.split(maxsplit=1)
    if len(parts) < 2:
        return None
    return parts[1].strip() or None


def _extract_request_id(data: str, prefix: str) -> int | None:
    if not data.startswith(prefix):
        return None
    try:
        return int(data[len(prefix):])
    except ValueError:
        return None


def _is_admin_telegram_user(telegram_user_id: int | None) -> bool:
    if telegram_user_id is None:
        return False
    return telegram_user_id in set(get_settings().telegram_admin_chat_ids)


def _is_image_document(document: dict[str, Any] | None) -> bool:
    if not document:
        return False
    mime_type = str(document.get("mime_type") or "")
    return mime_type.startswith("image/")


def _telegram_api_request_sync(method: str, payload: dict[str, Any]) -> dict[str, Any]:
    token = get_settings().telegram_bot_token
    if not token:
        raise RuntimeError("telegram bot token is not configured")

    request = urllib.request.Request(
        url=f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:  # pragma: no cover - network/runtime path
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"telegram api error {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:  # pragma: no cover - network/runtime path
        raise RuntimeError(f"telegram api request failed: {exc}") from exc

    parsed = json.loads(raw or "{}")
    if not parsed.get("ok"):  # pragma: no cover - network/runtime path
        raise RuntimeError(f"telegram api error: {parsed}")
    return parsed.get("result") or {}


async def _telegram_api_request(method: str, payload: dict[str, Any]) -> dict[str, Any]:
    return await asyncio.to_thread(_telegram_api_request_sync, method, payload)


async def _send_message(
    chat_id: int,
    text: str,
    *,
    reply_markup: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return await _telegram_api_request("sendMessage", payload)


async def _send_photo(
    chat_id: int,
    photo: str,
    *,
    caption: str,
    reply_markup: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"chat_id": chat_id, "photo": photo, "caption": caption}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return await _telegram_api_request("sendPhoto", payload)


async def _answer_callback_query(callback_query_id: str, text: str) -> None:
    await _telegram_api_request(
        "answerCallbackQuery",
        {"callback_query_id": callback_query_id, "text": text, "show_alert": False},
    )


async def _send_payment_qr(chat_id: int) -> None:
    qr_url = get_settings().telegram_payment_qr_url
    if qr_url:
        await _send_photo(chat_id, qr_url, caption=_payment_caption(), reply_markup=_support_keyboard())
        return

    await _send_message(
        chat_id,
        (
            "QR-код для оплаты не настроен. Напишите в поддержку.\n\n"
            "Payment QR code is not configured yet. Please contact support."
        ),
        reply_markup=_support_keyboard(),
    )


async def _notify_admins_about_submission(request: SubscriptionPurchaseRequest) -> bool:
    admin_chat_ids = get_settings().telegram_admin_chat_ids
    if not admin_chat_ids:
        print("Telegram admin chat IDs are not configured; payment request was not forwarded.")
        return False

    if not request.receipt_file_id:
        print(f"Payment request {request.id} has no receipt file ID.")
        return False

    caption = _admin_notification_text(request)
    keyboard = _admin_review_keyboard(request.id)
    delivered = False
    for admin_chat_id in admin_chat_ids:
        try:
            await _send_photo(
                admin_chat_id,
                request.receipt_file_id,
                caption=caption,
                reply_markup=keyboard,
            )
            delivered = True
        except Exception as exc:  # pragma: no cover - runtime integration path
            print(f"Failed to notify Telegram admin chat {admin_chat_id}: {exc}")
    return delivered


async def _resume_purchase_flow(request: SubscriptionPurchaseRequest) -> None:
    if not request.telegram_chat_id:
        return

    if request.status in {PURCHASE_STATUS_AWAITING_START, PURCHASE_STATUS_AWAITING_ACCEPTANCE}:
        await _send_message(
            request.telegram_chat_id,
            _warning_text(),
            reply_markup=_checkout_keyboard(request.id),
        )
        return

    if request.status == PURCHASE_STATUS_AWAITING_EMAIL:
        await _send_payment_qr(request.telegram_chat_id)
        await _send_message(
            request.telegram_chat_id,
            _email_prompt_text(request.site_email),
            reply_markup=_support_keyboard(),
        )
        return

    if request.status == PURCHASE_STATUS_AWAITING_RECEIPT:
        await _send_message(
            request.telegram_chat_id,
            _receipt_prompt_text(),
            reply_markup=_support_keyboard(),
        )
        return

    if request.status == PURCHASE_STATUS_SUBMITTED:
        await _send_message(
            request.telegram_chat_id,
            _submitted_text(),
            reply_markup=_support_keyboard(),
        )
        return

    if request.status == PURCHASE_STATUS_APPROVED:
        await _send_message(
            request.telegram_chat_id,
            _approved_text(),
            reply_markup=_support_keyboard(),
        )
        return

    if request.status in {PURCHASE_STATUS_REJECTED, PURCHASE_STATUS_EXPIRED}:
        await _send_message(
            request.telegram_chat_id,
            _rejected_text() if request.status == PURCHASE_STATUS_REJECTED else _expired_text(),
            reply_markup=_support_keyboard(),
        )


async def _handle_start_command(
    db: AsyncSession,
    message: dict[str, Any],
    start_token: str | None,
) -> None:
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if not isinstance(chat_id, int):
        return

    telegram_user = message.get("from") or {}
    telegram_user_id = telegram_user.get("id")
    if not isinstance(telegram_user_id, int):
        telegram_user_id = None

    if not start_token:
        await _send_message(chat_id, _generic_start_text(), reply_markup=_support_keyboard())
        return

    request = await get_purchase_request_by_start_token(db, start_token)
    if not request:
        await _send_message(chat_id, _expired_text(), reply_markup=_support_keyboard())
        return

    if request.telegram_user_id and telegram_user_id and request.telegram_user_id != telegram_user_id:
        await _send_message(
            chat_id,
            (
                "Эта ссылка привязана к другому пользователю Telegram.\n\n"
                "This link is already attached to another Telegram user."
            ),
            reply_markup=_support_keyboard(),
        )
        return

    request.telegram_chat_id = chat_id
    request.telegram_user_id = telegram_user_id
    request.telegram_username = telegram_user.get("username")
    request.telegram_first_name = telegram_user.get("first_name")
    request.telegram_language_code = telegram_user.get("language_code")
    if request.status == PURCHASE_STATUS_AWAITING_START:
        request.status = PURCHASE_STATUS_AWAITING_ACCEPTANCE
    request.updated_at = datetime.utcnow()
    await db.commit()
    await _resume_purchase_flow(request)


async def _handle_accept_callback(
    db: AsyncSession,
    callback_query: dict[str, Any],
    request_id: int,
) -> None:
    callback_query_id = str(callback_query.get("id") or "")
    telegram_user = callback_query.get("from") or {}
    telegram_user_id = telegram_user.get("id")
    message = callback_query.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")

    request = await get_purchase_request_by_id(db, request_id)
    if not request or request.status in {PURCHASE_STATUS_EXPIRED, PURCHASE_STATUS_REJECTED}:
        await _answer_callback_query(callback_query_id, "Link expired")
        return

    if request.telegram_user_id and request.telegram_user_id != telegram_user_id:
        await _answer_callback_query(callback_query_id, "Unauthorized")
        return

    if isinstance(chat_id, int):
        request.telegram_chat_id = chat_id
    if isinstance(telegram_user_id, int):
        request.telegram_user_id = telegram_user_id
    request.telegram_username = telegram_user.get("username")
    request.telegram_first_name = telegram_user.get("first_name")
    request.telegram_language_code = telegram_user.get("language_code")
    request.status = PURCHASE_STATUS_AWAITING_EMAIL
    request.updated_at = datetime.utcnow()
    await db.commit()

    await _answer_callback_query(callback_query_id, "Accepted")
    if request.telegram_chat_id:
        await _send_payment_qr(request.telegram_chat_id)
        await _send_message(
            request.telegram_chat_id,
            _email_prompt_text(request.site_email),
            reply_markup=_support_keyboard(),
        )


async def _handle_admin_approval(
    db: AsyncSession,
    callback_query: dict[str, Any],
    request_id: int,
) -> None:
    callback_query_id = str(callback_query.get("id") or "")
    telegram_user = callback_query.get("from") or {}
    telegram_user_id = telegram_user.get("id")
    if not _is_admin_telegram_user(telegram_user_id):
        await _answer_callback_query(callback_query_id, "Admin access required")
        return

    request = await get_purchase_request_by_id(db, request_id)
    if not request:
        await _answer_callback_query(callback_query_id, "Request not found")
        return

    if request.status == PURCHASE_STATUS_APPROVED:
        await _answer_callback_query(callback_query_id, "Already approved")
        return

    if request.status != PURCHASE_STATUS_SUBMITTED:
        await _answer_callback_query(callback_query_id, "Request is not waiting for review")
        return

    await admin_service.grant_premium(
        db,
        request.user_id,
        days=get_settings().telegram_premium_days,
        plan_code=get_settings().telegram_premium_plan_code,
    )
    request.status = PURCHASE_STATUS_APPROVED
    request.processed_at = datetime.utcnow()
    request.processed_by_telegram_user_id = telegram_user_id
    request.updated_at = request.processed_at
    await db.commit()

    await _answer_callback_query(callback_query_id, "Subscription activated")
    if request.telegram_chat_id:
        await _send_message(
            request.telegram_chat_id,
            _approved_text(),
            reply_markup=_support_keyboard(),
        )


async def _handle_admin_rejection(
    db: AsyncSession,
    callback_query: dict[str, Any],
    request_id: int,
) -> None:
    callback_query_id = str(callback_query.get("id") or "")
    telegram_user = callback_query.get("from") or {}
    telegram_user_id = telegram_user.get("id")
    if not _is_admin_telegram_user(telegram_user_id):
        await _answer_callback_query(callback_query_id, "Admin access required")
        return

    request = await get_purchase_request_by_id(db, request_id)
    if not request:
        await _answer_callback_query(callback_query_id, "Request not found")
        return

    if request.status == PURCHASE_STATUS_REJECTED:
        await _answer_callback_query(callback_query_id, "Already rejected")
        return

    if request.status != PURCHASE_STATUS_SUBMITTED:
        await _answer_callback_query(callback_query_id, "Request is not waiting for review")
        return

    request.status = PURCHASE_STATUS_REJECTED
    request.processed_at = datetime.utcnow()
    request.processed_by_telegram_user_id = telegram_user_id
    request.updated_at = request.processed_at
    await db.commit()

    await _answer_callback_query(callback_query_id, "Rejected")
    if request.telegram_chat_id:
        await _send_message(
            request.telegram_chat_id,
            _rejected_text(),
            reply_markup=_support_keyboard(),
        )


async def handle_callback_query(db: AsyncSession, callback_query: dict[str, Any]) -> None:
    data = str(callback_query.get("data") or "")
    accept_request_id = _extract_request_id(data, CALLBACK_ACCEPT_PREFIX)
    if accept_request_id is not None:
        await _handle_accept_callback(db, callback_query, accept_request_id)
        return

    approve_request_id = _extract_request_id(data, CALLBACK_ADMIN_APPROVE_PREFIX)
    if approve_request_id is not None:
        await _handle_admin_approval(db, callback_query, approve_request_id)
        return

    reject_request_id = _extract_request_id(data, CALLBACK_ADMIN_REJECT_PREFIX)
    if reject_request_id is not None:
        await _handle_admin_rejection(db, callback_query, reject_request_id)
        return

    callback_query_id = str(callback_query.get("id") or "")
    if callback_query_id:
        await _answer_callback_query(callback_query_id, "Unsupported action")


async def handle_message(db: AsyncSession, message: dict[str, Any]) -> None:
    chat = message.get("chat") or {}
    if chat.get("type") not in {None, "private"}:
        return

    chat_id = chat.get("id")
    if not isinstance(chat_id, int):
        return

    text = message.get("text")
    start_token = _extract_start_token(text if isinstance(text, str) else None)
    if isinstance(text, str) and text.strip().startswith("/start"):
        await _handle_start_command(db, message, start_token)
        return

    request = await get_latest_chat_purchase_request(db, chat_id)
    if not request:
        await _send_message(chat_id, _generic_start_text(), reply_markup=_support_keyboard())
        return

    if request.status == PURCHASE_STATUS_AWAITING_EMAIL and isinstance(text, str):
        normalized = _normalize_message_email(text)
        if not normalized:
            await _send_message(chat_id, _invalid_email_text(), reply_markup=_support_keyboard())
            return

        if normalized != normalize_email(request.site_email):
            await _send_message(
                chat_id,
                _email_mismatch_text(request.site_email),
                reply_markup=_support_keyboard(),
            )
            return

        request.provided_email = normalized
        request.status = PURCHASE_STATUS_AWAITING_RECEIPT
        request.updated_at = datetime.utcnow()
        await db.commit()
        await _send_message(chat_id, _receipt_prompt_text(), reply_markup=_support_keyboard())
        return

    photos = message.get("photo") or []
    document = message.get("document")
    if request.status == PURCHASE_STATUS_AWAITING_EMAIL and (photos or _is_image_document(document)):
        await _send_message(chat_id, _need_email_first_text(), reply_markup=_support_keyboard())
        return

    if request.status == PURCHASE_STATUS_AWAITING_RECEIPT:
        file_id: str | None = None
        file_unique_id: str | None = None
        if photos:
            largest = photos[-1]
            file_id = largest.get("file_id")
            file_unique_id = largest.get("file_unique_id")
        elif _is_image_document(document):
            file_id = document.get("file_id")
            file_unique_id = document.get("file_unique_id")

        if not file_id:
            await _send_message(chat_id, _need_screenshot_text(), reply_markup=_support_keyboard())
            return

        now = datetime.utcnow()
        request.receipt_file_id = str(file_id)
        request.receipt_file_unique_id = str(file_unique_id) if file_unique_id else None
        request.receipt_submitted_at = now
        request.submitted_at = now
        request.status = PURCHASE_STATUS_SUBMITTED
        request.updated_at = now
        await db.commit()

        delivered = await _notify_admins_about_submission(request)
        if delivered:
            request.admin_notified_at = datetime.utcnow()
            request.updated_at = request.admin_notified_at
            await db.commit()
        await _send_message(chat_id, _submitted_text(), reply_markup=_support_keyboard())
        return

    if request.status == PURCHASE_STATUS_SUBMITTED:
        if not request.admin_notified_at:
            delivered = await _notify_admins_about_submission(request)
            if delivered:
                request.admin_notified_at = datetime.utcnow()
                request.updated_at = request.admin_notified_at
                await db.commit()
        await _send_message(chat_id, _submitted_text(), reply_markup=_support_keyboard())
        return

    if request.status == PURCHASE_STATUS_APPROVED:
        await _send_message(chat_id, _approved_text(), reply_markup=_support_keyboard())
        return

    if request.status == PURCHASE_STATUS_REJECTED:
        await _send_message(chat_id, _rejected_text(), reply_markup=_support_keyboard())
        return

    if request.status == PURCHASE_STATUS_EXPIRED:
        await _send_message(chat_id, _expired_text(), reply_markup=_support_keyboard())
        return

    await _resume_purchase_flow(request)


async def process_update(db: AsyncSession, update: dict[str, Any]) -> None:
    if callback_query := update.get("callback_query"):
        await handle_callback_query(db, callback_query)
        return

    if message := update.get("message"):
        await handle_message(db, message)


def verify_webhook_secret(secret_header: str | None) -> None:
    expected = get_settings().telegram_webhook_secret
    if not expected:
        return
    if secret_header == expected:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid telegram webhook secret")
