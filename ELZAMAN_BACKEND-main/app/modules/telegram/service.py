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
CALLBACK_MENU_BUY = "menu:buy"
CALLBACK_MENU_SUPPORT = "menu:support"
CALLBACK_DONE = "purchase:done"
CALLBACK_ACCEPT_PREFIX = "purchase:accept:"
CALLBACK_ADMIN_APPROVE_PREFIX = "admin:approve:"
CALLBACK_ADMIN_REJECT_PREFIX = "admin:reject:"


def _main_menu_keyboard() -> dict[str, list[list[dict[str, str]]]]:
    return {
        "inline_keyboard": [
            [{"text": "Купить подписку", "callback_data": CALLBACK_MENU_BUY}],
            [{"text": "Техподдержка", "callback_data": CALLBACK_MENU_SUPPORT}],
        ]
    }


def _support_keyboard() -> dict[str, list[list[dict[str, str]]]]:
    return {
        "inline_keyboard": [
            [{"text": "Instagram Direct", "url": get_settings().telegram_support_url}],
            [{"text": "Купить подписку", "callback_data": CALLBACK_MENU_BUY}],
        ]
    }


def _agreement_keyboard(request_id: int) -> dict[str, list[list[dict[str, str]]]]:
    return {
        "inline_keyboard": [
            [
                {
                    "text": "Я соглашаюсь",
                    "callback_data": f"{CALLBACK_ACCEPT_PREFIX}{request_id}",
                }
            ]
        ]
    }


def _receipt_keyboard() -> dict[str, list[list[dict[str, str]]]]:
    return {
        "inline_keyboard": [
            [{"text": "Готово", "callback_data": CALLBACK_DONE}],
            [{"text": "Техподдержка", "callback_data": CALLBACK_MENU_SUPPORT}],
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
        "Оформление подписки выполняется вручную после подтверждения оплаты.\n"
        f"Стоимость подписки: {price_label}.\n\n"
        "Продолжая оплату, вы подтверждаете, что переводите средства добровольно и по собственной инициативе.\n"
        "Со своей стороны мы гарантируем, что после проверки перевода подписка будет выдана на аккаунт, "
        "который зарегистрирован на указанный вами email.\n"
        "Проверка платежа и активация подписки могут занять до 24 часов.\n\n"
        "Subscription activation is completed manually after payment verification.\n"
        f"Subscription price: {price_label}.\n\n"
        "By proceeding, you confirm that you are making the transfer voluntarily and at your own discretion.\n"
        "We guarantee that once the transfer is verified, the subscription will be activated for the account "
        "registered under the email you provide.\n"
        "Payment review and subscription activation may take up to 24 hours."
    )


def _main_menu_text(linked_purchase: bool) -> str:
    if linked_purchase:
        return (
            "Ваш аккаунт распознан. Выберите действие ниже.\n\n"
            "Your account has been recognized. Choose an action below."
        )

    return (
        "Выберите действие ниже.\n"
        "Чтобы оформить подписку, откройте бота по кнопке покупки на сайте, тогда заявка будет привязана к вашему аккаунту.\n\n"
        "Choose an action below.\n"
        "To purchase a subscription, open the bot from the website purchase button so the request can be linked to your account."
    )


def _support_text() -> str:
    return (
        "Если возникла проблема с оплатой или активацией подписки, пожалуйста, напишите нам в Direct в Instagram "
        "и кратко опишите ситуацию.\n\n"
        "If you have any issue with payment or subscription activation, please send us a direct message on Instagram "
        "and briefly describe the problem."
    )


def _buy_requires_website_text() -> str:
    return (
        "Чтобы оформить подписку, сначала нажмите кнопку покупки на сайте. Это привяжет заявку к вашему аккаунту.\n\n"
        "To purchase a subscription, first use the purchase button on the website. This links the request to your account."
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
        "Отправьте email, на который зарегистрирован ваш аккаунт на сайте.\n"
        f"Email вашего аккаунта: {site_email}\n\n"
        "Send the email used for your website account.\n"
        f"Your account email: {site_email}"
    )


def _payment_guide_text() -> str:
    return (
        "1. Оплатите подписку по QR-коду.\n"
        "2. Сделайте скриншот подтверждения перевода.\n"
        "3. Отправьте скриншот в этот чат.\n"
        "4. После загрузки скриншота нажмите кнопку «Готово».\n\n"
        "1. Pay for the subscription using the QR code.\n"
        "2. Take a screenshot of the payment confirmation.\n"
        "3. Send the screenshot in this chat.\n"
        "4. After uploading the screenshot, press “Done”."
    )


def _receipt_received_text() -> str:
    return (
        "Скриншот получен. Если всё верно, нажмите «Готово», чтобы отправить заявку администратору.\n"
        "Если нужно заменить скриншот, просто отправьте новый файл в чат.\n\n"
        "Your screenshot has been received. If everything is correct, press “Done” to send the request to the administrator.\n"
        "If you need to replace the screenshot, simply send a new file in the chat."
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


def _done_requires_screenshot_text() -> str:
    return (
        "Сначала отправьте скриншот перевода, затем нажмите «Готово».\n\n"
        "Please send the payment screenshot first, then press “Done”."
    )


def _admin_notification_text(request: SubscriptionPurchaseRequest) -> str:
    return (
        "New premium payment request\n"
        f"Request ID: {request.id}\n"
        f"Email: {request.provided_email or request.site_email}\n"
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
        await _send_photo(chat_id, qr_url, caption=_payment_caption())
        return

    await _send_message(
        chat_id,
        (
            "QR-код для оплаты не настроен. Напишите в поддержку.\n\n"
            "Payment QR code is not configured yet. Please contact support."
        ),
        reply_markup=_receipt_keyboard(),
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


async def _send_main_menu(chat_id: int, *, linked_purchase: bool) -> None:
    await _send_message(
        chat_id,
        _main_menu_text(linked_purchase),
        reply_markup=_main_menu_keyboard(),
    )


async def _send_support_message(chat_id: int) -> None:
    await _send_message(
        chat_id,
        _support_text(),
        reply_markup=_support_keyboard(),
    )


async def _send_receipt_step(chat_id: int, *, has_receipt: bool) -> None:
    if not has_receipt:
        await _send_payment_qr(chat_id)
        await _send_message(
            chat_id,
            _payment_guide_text(),
            reply_markup=_receipt_keyboard(),
        )
        return

    await _send_message(
        chat_id,
        _receipt_received_text(),
        reply_markup=_receipt_keyboard(),
    )


async def _send_buy_flow_entry(request: SubscriptionPurchaseRequest) -> None:
    if not request.telegram_chat_id:
        return

    if request.status in {PURCHASE_STATUS_AWAITING_START, PURCHASE_STATUS_AWAITING_ACCEPTANCE}:
        await _send_message(
            request.telegram_chat_id,
            _warning_text(),
            reply_markup=_agreement_keyboard(request.id),
        )
        return

    if request.status == PURCHASE_STATUS_AWAITING_EMAIL:
        await _send_message(
            request.telegram_chat_id,
            _email_prompt_text(request.site_email),
        )
        return

    if request.status == PURCHASE_STATUS_AWAITING_RECEIPT:
        await _send_receipt_step(
            request.telegram_chat_id,
            has_receipt=bool(request.receipt_file_id),
        )
        return

    if request.status == PURCHASE_STATUS_SUBMITTED:
        await _send_message(
            request.telegram_chat_id,
            _submitted_text(),
        )
        return

    if request.status == PURCHASE_STATUS_APPROVED:
        await _send_message(
            request.telegram_chat_id,
            _approved_text(),
        )
        return

    if request.status in {PURCHASE_STATUS_REJECTED, PURCHASE_STATUS_EXPIRED}:
        await _send_message(
            request.telegram_chat_id,
            _rejected_text() if request.status == PURCHASE_STATUS_REJECTED else _expired_text(),
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
        request = await get_latest_chat_purchase_request(db, chat_id)
        await _send_main_menu(chat_id, linked_purchase=bool(request))
        return

    request = await get_purchase_request_by_start_token(db, start_token)
    if not request:
        await _send_message(chat_id, _expired_text())
        await _send_main_menu(chat_id, linked_purchase=False)
        return

    if request.telegram_user_id and telegram_user_id and request.telegram_user_id != telegram_user_id:
        await _send_message(
            chat_id,
            (
                "Эта ссылка привязана к другому пользователю Telegram.\n\n"
                "This link is already attached to another Telegram user."
            ),
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
    await _send_main_menu(chat_id, linked_purchase=True)


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

    if request.status not in {PURCHASE_STATUS_AWAITING_START, PURCHASE_STATUS_AWAITING_ACCEPTANCE}:
        await _answer_callback_query(callback_query_id, "Already confirmed")
        await _send_buy_flow_entry(request)
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
        await _send_message(request.telegram_chat_id, _email_prompt_text(request.site_email))


async def _handle_menu_buy_callback(
    db: AsyncSession,
    callback_query: dict[str, Any],
) -> None:
    callback_query_id = str(callback_query.get("id") or "")
    message = callback_query.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")

    if not isinstance(chat_id, int):
        if callback_query_id:
            await _answer_callback_query(callback_query_id, "Chat not found")
        return

    request = await get_latest_chat_purchase_request(db, chat_id)
    if not request:
        await _answer_callback_query(callback_query_id, "Open from website first")
        await _send_message(chat_id, _buy_requires_website_text(), reply_markup=_main_menu_keyboard())
        return

    await _answer_callback_query(callback_query_id, "Opening purchase flow")
    await _send_buy_flow_entry(request)


async def _handle_menu_support_callback(callback_query: dict[str, Any]) -> None:
    callback_query_id = str(callback_query.get("id") or "")
    message = callback_query.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")

    if callback_query_id:
        await _answer_callback_query(callback_query_id, "Support")
    if isinstance(chat_id, int):
        await _send_support_message(chat_id)


async def _handle_done_callback(
    db: AsyncSession,
    callback_query: dict[str, Any],
) -> None:
    callback_query_id = str(callback_query.get("id") or "")
    message = callback_query.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")

    if not isinstance(chat_id, int):
        if callback_query_id:
            await _answer_callback_query(callback_query_id, "Chat not found")
        return

    request = await get_latest_chat_purchase_request(db, chat_id)
    if not request:
        await _answer_callback_query(callback_query_id, "Open from website first")
        await _send_message(chat_id, _buy_requires_website_text(), reply_markup=_main_menu_keyboard())
        return

    if request.status == PURCHASE_STATUS_AWAITING_EMAIL:
        await _answer_callback_query(callback_query_id, "Email required")
        await _send_message(chat_id, _email_prompt_text(request.site_email))
        return

    if request.status != PURCHASE_STATUS_AWAITING_RECEIPT:
        await _answer_callback_query(callback_query_id, "Already submitted")
        await _send_buy_flow_entry(request)
        return

    if not request.receipt_file_id:
        await _answer_callback_query(callback_query_id, "Screenshot required")
        await _send_message(chat_id, _done_requires_screenshot_text(), reply_markup=_receipt_keyboard())
        return

    now = datetime.utcnow()
    request.submitted_at = now
    request.status = PURCHASE_STATUS_SUBMITTED
    request.updated_at = now
    await db.commit()

    delivered = await _notify_admins_about_submission(request)
    if delivered:
        request.admin_notified_at = datetime.utcnow()
        request.updated_at = request.admin_notified_at
        await db.commit()

    await _answer_callback_query(callback_query_id, "Sent to admin")
    await _send_message(chat_id, _submitted_text())


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
    if data == CALLBACK_MENU_BUY:
        await _handle_menu_buy_callback(db, callback_query)
        return

    if data == CALLBACK_MENU_SUPPORT:
        await _handle_menu_support_callback(callback_query)
        return

    if data == CALLBACK_DONE:
        await _handle_done_callback(db, callback_query)
        return

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
        await _send_main_menu(chat_id, linked_purchase=False)
        return

    if request.status == PURCHASE_STATUS_AWAITING_EMAIL and isinstance(text, str):
        normalized = _normalize_message_email(text)
        if not normalized:
            await _send_message(chat_id, _invalid_email_text())
            return

        if normalized != normalize_email(request.site_email):
            await _send_message(
                chat_id,
                _email_mismatch_text(request.site_email),
            )
            return

        request.provided_email = normalized
        request.status = PURCHASE_STATUS_AWAITING_RECEIPT
        request.updated_at = datetime.utcnow()
        await db.commit()
        await _send_receipt_step(chat_id, has_receipt=False)
        return

    photos = message.get("photo") or []
    document = message.get("document")
    if request.status == PURCHASE_STATUS_AWAITING_EMAIL and (photos or _is_image_document(document)):
        await _send_message(chat_id, _need_email_first_text())
        return

    if request.status == PURCHASE_STATUS_AWAITING_RECEIPT:
        if photos or _is_image_document(document):
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
                await _send_message(chat_id, _need_screenshot_text(), reply_markup=_receipt_keyboard())
                return

            now = datetime.utcnow()
            request.receipt_file_id = str(file_id)
            request.receipt_file_unique_id = str(file_unique_id) if file_unique_id else None
            request.receipt_submitted_at = now
            request.updated_at = now
            await db.commit()
            await _send_receipt_step(chat_id, has_receipt=True)
            return

        await _send_receipt_step(chat_id, has_receipt=bool(request.receipt_file_id))
        return

    if request.status == PURCHASE_STATUS_SUBMITTED:
        if not request.admin_notified_at and request.receipt_file_id:
            delivered = await _notify_admins_about_submission(request)
            if delivered:
                request.admin_notified_at = datetime.utcnow()
                request.updated_at = request.admin_notified_at
                await db.commit()
        await _send_message(chat_id, _submitted_text())
        return

    if request.status == PURCHASE_STATUS_APPROVED:
        await _send_message(chat_id, _approved_text())
        return

    if request.status == PURCHASE_STATUS_REJECTED:
        await _send_message(chat_id, _rejected_text())
        return

    if request.status == PURCHASE_STATUS_EXPIRED:
        await _send_message(chat_id, _expired_text())
        return

    await _send_main_menu(chat_id, linked_purchase=True)


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
