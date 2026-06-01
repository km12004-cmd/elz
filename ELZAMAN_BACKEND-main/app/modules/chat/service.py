from collections import defaultdict, deque
import re
from time import monotonic
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import Settings
from app.modules.chat.schemas import ChatHistoryMessage

MAX_HISTORY_MESSAGES = 6
RATE_LIMIT_MAX_MESSAGES = 10
RATE_LIMIT_WINDOW_SECONDS = 60

SYSTEM_PROMPT = (
    "You are El Zaman AI, the website assistant for the El Zaman project. "
    "ONLY answer questions related to El Zaman: the project purpose, website navigation, "
    "songs, Kyrgyz language learning, flashcards, playlists, profile progress, premium access, "
    "account basics, and how to use the learning features. "
    "Do not answer unrelated questions about general knowledge, politics, coding, finance, medicine, "
    "law, entertainment, or any topic outside El Zaman. If a question is unrelated, politely refuse "
    "and say that you can only help with El Zaman and learning Kyrgyz through the site. "
    "Detect the language of the latest user message and answer in that same language. "
    "If the user writes in Russian, answer in Russian. If the user writes in Kyrgyz, answer in Kyrgyz. "
    "If the user writes in English, answer in English. Do not switch to Kyrgyz when the user asked in Russian. "
    "Keep a natural conversational tone: answer the exact question first, then add 1-3 short practical steps if useful. "
    "Do not invent button labels, menu names, pages, prices, artists, songs, or features. "
    "Known current UI details: on the guest homepage there are Sign up and Sign in buttons; "
    "authenticated users see Songs, My Flashcards, My Playlists, Profile & progress, Premium, and profile controls. "
    "If the user asks which songs are available, say that the exact list is in the Songs section. "
    "Do not invent song titles and do not translate the Songs UI label into another menu name. "
    "If the exact UI step is not known, say that you are not sure and suggest checking the homepage or profile menu. "
    "Be brief, friendly, and practical. "
    "Do not invent private user data, account state, prices, artists, songs, or unavailable site content. "
    "If you do not know a project detail, say so and suggest checking the relevant page."
)

KYRGYZ_MARKERS = {
    "\u043a\u0430\u043d\u0442\u0438\u043f",
    "\u044d\u043c\u043d\u0435",
    "\u043a\u0430\u0439\u0441\u044b",
    "\u043a\u0430\u0439\u0434\u0430",
    "\u043a\u0430\u0447\u0430\u043d",
    "\u0431\u043e\u043b\u043e\u0442",
    "\u0441\u0430\u043b\u0430\u043c",
    "\u043a\u044b\u0440\u0433\u044b\u0437",
    "\u043a\u0430\u0442\u0442\u0430\u043b",
    "\u044b\u0440",
    "\u044b\u0440\u043b\u0430\u0440",
    "\u044b\u0440\u043b\u044b\u0440",
    "\u0431\u0443\u043b",
    "\u0436\u0435\u0440\u0434\u0435",
    "\u044d\u043b\u0435",
}
RUSSIAN_MARKERS = {
    "\u043a\u0430\u043a",
    "\u0447\u0442\u043e",
    "\u0433\u0434\u0435",
    "\u043a\u043e\u0433\u0434\u0430",
    "\u043f\u043e\u0447\u0435\u043c\u0443",
    "\u0437\u0430\u0447\u0435\u043c",
    "\u043f\u0440\u0438\u0432\u0435\u0442",
    "\u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440",
    "\u0432\u043e\u0439\u0442\u0438",
}
ELZAMAN_KEYWORDS = {
    "el zaman",
    "elzaman",
    "site",
    "sign up",
    "sign in",
    "song",
    "songs",
    "flashcard",
    "flashcards",
    "playlist",
    "playlists",
    "profile",
    "premium",
    "kyrgyz",
    "\u0441\u0430\u0439\u0442",
    "\u044d\u043b\u044c\u0437\u0430\u043c\u0430\u043d",
    "\u044d\u043b\u044c \u0437\u0430\u043c\u0430\u043d",
    "\u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440",
    "\u0440\u0435\u0433\u0438\u0441\u0442\u0440",
    "\u0432\u043e\u0439\u0442\u0438",
    "\u043f\u0435\u0441\u043d",
    "\u043a\u0430\u0440\u0442\u043e\u0447",
    "\u043f\u043b\u0435\u0439\u043b\u0438\u0441\u0442",
    "\u043f\u0440\u043e\u0444\u0438\u043b",
    "\u043f\u0440\u0435\u043c\u0438\u0443\u043c",
    "\u043a\u044b\u0440\u0433\u044b\u0437",
    "\u0441\u0430\u043b\u0430\u043c",
    "\u043a\u0430\u043d\u0442\u0438\u043f",
    "\u043a\u0430\u0442\u0442\u0430\u043b",
    "\u044b\u0440",
    "\u0434\u043e\u043b\u0431\u043e\u043e\u0440",
}

_requests_by_client: dict[str, deque[float]] = defaultdict(deque)


def reset_rate_limits() -> None:
    _requests_by_client.clear()


def assert_rate_limit(client_key: str) -> None:
    now = monotonic()
    timestamps = _requests_by_client[client_key]

    while timestamps and now - timestamps[0] >= RATE_LIMIT_WINDOW_SECONDS:
        timestamps.popleft()

    if len(timestamps) >= RATE_LIMIT_MAX_MESSAGES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many chat messages. Please try again later.",
        )

    timestamps.append(now)


def detect_response_language(message: str) -> str:
    lowered = message.lower()

    if any(marker in lowered for marker in KYRGYZ_MARKERS) or any(char in lowered for char in "\u04a3\u04e9\u04af"):
        return "Kyrgyz"
    if any(marker in lowered for marker in RUSSIAN_MARKERS) or re.search(r"[\u0430-\u044f\u0451]", lowered):
        return "Russian"
    return "English"


def build_language_instruction(message: str) -> str:
    language = detect_response_language(message)
    return (
        f"Latest user message language: {language}. "
        f"Answer ONLY in {language}. "
        "Do not translate the answer into another language unless the user explicitly asks for translation."
    )


def latest_user_message(messages: list[dict[str, str]]) -> str:
    for item in reversed(messages):
        if item["role"] == "user":
            return item["content"]
    return ""


def is_elzaman_related(message: str) -> bool:
    lowered = message.lower()
    return any(keyword in lowered for keyword in ELZAMAN_KEYWORDS)


def is_song_list_question(message: str) -> bool:
    lowered = message.lower()
    song_tokens = {
        "song",
        "songs",
        "\u043f\u0435\u0441\u043d",
        "\u044b\u0440",
        "\u044b\u0440\u043b\u0430\u0440",
        "\u044b\u0440\u043b\u044b\u0440",
    }
    list_tokens = {
        "which",
        "what",
        "list",
        "available",
        "\u043a\u0430\u043a\u0438\u0435",
        "\u0441\u043f\u0438\u0441\u043e\u043a",
        "\u0435\u0441\u0442\u044c",
        "\u043a\u0430\u0439\u0441\u044b",
        "\u0431\u0430\u0440",
        "\u0442\u0438\u0437\u043c\u0435",
    }
    return any(token in lowered for token in song_tokens) and any(token in lowered for token in list_tokens)


def _fallback_refusal(language: str) -> str:
    if language == "Kyrgyz":
        return (
            "\u041c\u0435\u043d El Zaman \u0436\u0430\u043d\u0430 \u0441\u0430\u0439\u0442\u0442\u0430 "
            "\u043a\u044b\u0440\u0433\u044b\u0437 \u0442\u0438\u043b\u0438\u043d \u04af\u0439\u0440\u04e9\u043d\u04af\u04af "
            "\u0431\u043e\u044e\u043d\u0447\u0430 \u044d\u043b\u0435 \u0436\u0430\u0440\u0434\u0430\u043c "
            "\u0431\u0435\u0440\u0435 \u0430\u043b\u0430\u043c."
        )
    if language == "Russian":
        return (
            "\u042f \u043c\u043e\u0433\u0443 \u043f\u043e\u043c\u043e\u0447\u044c "
            "\u0442\u043e\u043b\u044c\u043a\u043e \u0441 \u0432\u043e\u043f\u0440\u043e\u0441\u0430\u043c\u0438 "
            "\u043f\u043e El Zaman \u0438 \u0438\u0437\u0443\u0447\u0435\u043d\u0438\u044e "
            "\u043a\u044b\u0440\u0433\u044b\u0437\u0441\u043a\u043e\u0433\u043e \u044f\u0437\u044b\u043a\u0430 "
            "\u043d\u0430 \u0441\u0430\u0439\u0442\u0435."
        )
    return "I can only help with El Zaman and learning Kyrgyz through the website."


def build_local_fallback_answer(message: str) -> str:
    language = detect_response_language(message)
    lowered = message.lower()

    if not is_elzaman_related(message):
        return _fallback_refusal(language)

    register_tokens = {
        "register",
        "sign up",
        "\u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440",
        "\u043a\u0430\u0442\u0442\u0430\u043b",
    }
    if any(token in lowered for token in register_tokens):
        if language == "Kyrgyz":
            return (
                "El Zaman'\u0433\u0430 \u043a\u0430\u0442\u0442\u0430\u043b\u0443\u0443 "
                "\u04af\u0447\u04af\u043d \u0431\u0430\u0448\u043a\u044b \u0431\u0435\u0442\u0442\u0435\u0433\u0438 "
                "Sign up \u0431\u0430\u0441\u043a\u044b\u0447\u044b\u043d \u0442\u0430\u043d\u0434\u0430\u04a3\u044b\u0437. "
                "\u0410\u043d\u0434\u0430\u043d \u043a\u0438\u0439\u0438\u043d email \u0436\u0430\u043d\u0430 "
                "\u0441\u044b\u0440\u0441\u04e9\u0437 \u043a\u0438\u0440\u0433\u0438\u0437\u0438\u043f, "
                "\u043a\u0430\u0442\u0442\u043e\u043e\u043d\u0443 \u0431\u04af\u0442\u04af\u0440\u04e9\u0441\u04af\u0437."
            )
        if language == "Russian":
            return (
                "\u0427\u0442\u043e\u0431\u044b \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c\u0441\u044f "
                "\u0432 El Zaman, \u043d\u0430\u0436\u043c\u0438\u0442\u0435 Sign up "
                "\u043d\u0430 \u0433\u043b\u0430\u0432\u043d\u043e\u0439 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435. "
                "\u0417\u0430\u0442\u0435\u043c \u0443\u043a\u0430\u0436\u0438\u0442\u0435 email \u0438 "
                "\u043f\u0430\u0440\u043e\u043b\u044c, \u0447\u0442\u043e\u0431\u044b \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c "
                "\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044e."
            )
        return "To register in El Zaman, click Sign up on the homepage, then enter your email and password."

    if is_song_list_question(message):
        if language == "Kyrgyz":
            return (
                "\u042b\u0440\u043b\u0430\u0440\u0434\u044b\u043d \u0442\u0430\u043a "
                "\u0442\u0438\u0437\u043c\u0435\u0441\u0438\u043d Songs "
                "\u0431\u04e9\u043b\u04af\u043c\u04af\u043d\u04e9\u043d "
                "\u043a\u04e9\u0440\u04e9 \u0430\u043b\u0430\u0441\u044b\u0437. "
                "\u0410\u043b \u0436\u0435\u0440\u0434\u0435 \u044b\u0440\u0434\u044b "
                "\u0442\u0430\u043d\u0434\u0430\u043f, \u0442\u0435\u043a\u0441\u0442\u0438 "
                "\u0436\u0430\u043d\u0430 \u04af\u0439\u0440\u04e9\u043d\u04af\u04af "
                "\u0442\u0430\u043f\u0448\u044b\u0440\u043c\u0430\u043b\u0430\u0440\u044b "
                "\u043c\u0435\u043d\u0435\u043d \u0438\u0448\u0442\u0435\u0439\u0441\u0438\u0437. "
                "\u041c\u0435\u043d \u043a\u0430\u0442\u0430\u043b\u043e\u0433 "
                "\u043c\u0430\u0433\u0430 \u0431\u0435\u0440\u0438\u043b\u0431\u0435\u0441\u0435, "
                "\u044b\u0440 \u0430\u0442\u0442\u0430\u0440\u044b\u043d "
                "\u043e\u0439\u043b\u043e\u043f \u0442\u0430\u043f\u043f\u0430\u0439\u043c."
            )
        if language == "Russian":
            return (
                "\u0422\u043e\u0447\u043d\u044b\u0439 \u0441\u043f\u0438\u0441\u043e\u043a "
                "\u043f\u0435\u0441\u0435\u043d \u043c\u043e\u0436\u043d\u043e "
                "\u043f\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u0442\u044c "
                "\u0432 \u0440\u0430\u0437\u0434\u0435\u043b\u0435 Songs. "
                "\u0422\u0430\u043c \u043c\u043e\u0436\u043d\u043e "
                "\u0432\u044b\u0431\u0440\u0430\u0442\u044c \u043f\u0435\u0441\u043d\u044e "
                "\u0438 \u0443\u0447\u0438\u0442\u044c "
                "\u043a\u044b\u0440\u0433\u044b\u0437\u0441\u043a\u0438\u0439 "
                "\u0447\u0435\u0440\u0435\u0437 \u0442\u0435\u043a\u0441\u0442 "
                "\u0438 \u0437\u0430\u0434\u0430\u043d\u0438\u044f. "
                "\u042f \u043d\u0435 \u0431\u0443\u0434\u0443 "
                "\u0432\u044b\u0434\u0443\u043c\u044b\u0432\u0430\u0442\u044c "
                "\u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f, "
                "\u0435\u0441\u043b\u0438 \u043a\u0430\u0442\u0430\u043b\u043e\u0433 "
                "\u043d\u0435 \u043f\u0435\u0440\u0435\u0434\u0430\u043d "
                "\u0432 \u0447\u0430\u0442."
            )
        return (
            "Open the Songs section to see the exact song list. "
            "I will not invent song titles when the catalog is not passed into the chat."
        )

    if language == "Kyrgyz":
        return (
            "\u0421\u0430\u043b\u0430\u043c! \u041c\u0435\u043d El Zaman \u0431\u043e\u044e\u043d\u0447\u0430 "
            "\u0436\u0430\u0440\u0434\u0430\u043c \u0431\u0435\u0440\u0435 \u0430\u043b\u0430\u043c: "
            "\u044b\u0440\u043b\u0430\u0440, \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0430\u043b\u0430\u0440, "
            "\u043f\u043b\u0435\u0439\u043b\u0438\u0441\u0442\u0442\u0435\u0440, \u043f\u0440\u043e\u0444\u0438\u043b\u044c "
            "\u0436\u0430\u043d\u0430 \u043a\u044b\u0440\u0433\u044b\u0437 \u0442\u0438\u043b\u0438\u043d "
            "\u04af\u0439\u0440\u04e9\u043d\u04af\u04af."
        )
    if language == "Russian":
        return (
            "\u0414\u0430, \u044f \u043f\u043e\u043c\u043e\u0433\u0443 \u043f\u043e El Zaman: "
            "\u043f\u0435\u0441\u043d\u0438, \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438, "
            "\u043f\u043b\u0435\u0439\u043b\u0438\u0441\u0442\u044b, \u043f\u0440\u043e\u0444\u0438\u043b\u044c, "
            "\u043f\u0440\u0435\u043c\u0438\u0443\u043c \u0438 \u0438\u0437\u0443\u0447\u0435\u043d\u0438\u0435 "
            "\u043a\u044b\u0440\u0433\u044b\u0437\u0441\u043a\u043e\u0433\u043e."
        )
    return "I can help with El Zaman: songs, flashcards, playlists, profile, premium, and learning Kyrgyz."


def is_quota_limit_response(response: Any) -> bool:
    if response.status_code != 429:
        return False
    try:
        error_data = response.json().get("error", {})
    except ValueError:
        error_data = {}
    status_text = str(error_data.get("status", "")).lower()
    message = str(error_data.get("message", "")).lower()
    return status_text == "resource_exhausted" or "quota" in message or "free_tier" in message


def build_messages(history: list[ChatHistoryMessage], message: str) -> list[dict[str, str]]:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": build_language_instruction(message)},
    ]
    messages.extend(
        {"role": item.role, "content": item.content}
        for item in history[-MAX_HISTORY_MESSAGES:]
    )
    messages.append({"role": "user", "content": message})
    return messages


def build_gemini_payload(messages: list[dict[str, str]]) -> dict[str, Any]:
    system_parts = [item["content"] for item in messages if item["role"] == "system"]
    system_message = "\n\n".join(system_parts) if system_parts else SYSTEM_PROMPT
    content_messages = [item for item in messages if item["role"] != "system"]

    return {
        "system_instruction": {
            "parts": [{"text": system_message}],
        },
        "contents": [
            {
                "role": "model" if item["role"] == "assistant" else "user",
                "parts": [{"text": item["content"]}],
            }
            for item in content_messages
            if item["role"] in {"user", "assistant"} and item["content"].strip()
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 450,
        },
    }


def read_gemini_answer(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    candidates = data.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return None
    content = candidates[0].get("content") if isinstance(candidates[0], dict) else None
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list):
        return None

    texts = [part.get("text", "") for part in parts if isinstance(part, dict)]
    answer = "\n".join(text.strip() for text in texts if isinstance(text, str) and text.strip())
    return answer or None


async def post_gemini_generate_content(settings: Settings, messages: list[dict[str, str]]) -> str:
    if not settings.ai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured",
        )

    payload = build_gemini_payload(messages)

    try:
        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            response = await client.post(
                f"{settings.ai_base_url}/models/{settings.ai_model}:generateContent",
                headers={
                    "x-goog-api-key": settings.ai_api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI service timed out",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service is unavailable",
        ) from exc

    if response.status_code in {400, 401, 403}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured",
        )
    if is_quota_limit_response(response):
        return build_local_fallback_answer(latest_user_message(messages))
    if response.status_code == 429:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI service is busy. Please try again later.",
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service is unavailable",
        )

    answer = read_gemini_answer(response.json())
    if not answer:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an empty response",
        )

    return answer


async def post_openai_chat_completion(settings: Settings, messages: list[dict[str, str]]) -> str:
    if not settings.ai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured",
        )

    payload = {
        "model": settings.ai_model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 450,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            response = await client.post(
                f"{settings.ai_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.ai_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI service timed out",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service is unavailable",
        ) from exc

    if response.status_code in {401, 403}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured",
        )
    if response.status_code == 429:
        try:
            error_data = response.json().get("error", {})
        except ValueError:
            error_data = {}
        if error_data.get("code") == "insufficient_quota":
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="AI service has no available quota. Please check billing or use another API key.",
            )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI service is busy. Please try again later.",
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service is unavailable",
        )

    data: Any = response.json()
    answer = data.get("choices", [{}])[0].get("message", {}).get("content")
    if not isinstance(answer, str) or not answer.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an empty response",
        )

    return answer.strip()


async def post_chat_completion(settings: Settings, messages: list[dict[str, str]]) -> str:
    message = latest_user_message(messages)
    if is_song_list_question(message):
        return build_local_fallback_answer(message)
    if settings.ai_provider == "gemini":
        return await post_gemini_generate_content(settings, messages)
    return await post_openai_chat_completion(settings, messages)
