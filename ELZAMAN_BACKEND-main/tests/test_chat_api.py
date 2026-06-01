import os
from dataclasses import replace

import anyio
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import app.main
from app.core.config import get_settings
from app.modules.chat import service as chat_service
from app.modules.chat.schemas import ChatHistoryMessage


def _client(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    get_settings.cache_clear()
    chat_service.reset_rate_limits()
    return TestClient(app.main.app)


def test_chat_route_is_registered():
    routes = {
        route.path: {method.upper() for method in route.methods}
        for route in app.main.app.routes
        if hasattr(route, "methods")
    }

    assert "/api/chat/messages" in routes
    assert "POST" in routes["/api/chat/messages"]


def test_chat_rejects_empty_message(monkeypatch):
    client = _client(monkeypatch)

    response = client.post("/api/chat/messages", json={"message": "   ", "history": []})

    assert response.status_code == 422


def test_chat_rejects_too_long_message(monkeypatch):
    client = _client(monkeypatch)

    response = client.post("/api/chat/messages", json={"message": "x" * 1001, "history": []})

    assert response.status_code == 422


def test_chat_returns_503_when_ai_key_missing(monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    client = _client(monkeypatch)

    response = client.post("/api/chat/messages", json={"message": "How do I use flashcards?", "history": []})

    assert response.status_code == 503
    assert response.json()["detail"] == "AI service is not configured"


def test_chat_returns_answer_from_openai_compatible_provider(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "test-key")
    client = _client(monkeypatch)
    captured_messages = []

    async def fake_post_chat_completion(settings, messages):
        captured_messages.extend(messages)
        return "Use Songs and My Flashcards from the homepage."

    monkeypatch.setattr(chat_service, "post_chat_completion", fake_post_chat_completion)

    response = client.post(
        "/api/chat/messages",
        json={
            "message": "Where should I start?",
            "history": [
                {"role": "user", "content": "Hi"},
                {"role": "assistant", "content": "Hello"},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "answer": "Use Songs and My Flashcards from the homepage.",
    }
    assert captured_messages[0]["role"] == "system"
    assert captured_messages[-1] == {"role": "user", "content": "Where should I start?"}


def test_chat_uses_strict_elzaman_only_system_prompt():
    messages = chat_service.build_messages([], "What is the capital of France?")

    system_prompt = messages[0]["content"]

    assert "ONLY answer questions related to El Zaman" in system_prompt
    assert "politely refuse" in system_prompt
    assert "Do not answer unrelated" in system_prompt
    assert "songs" in system_prompt
    assert "flashcards" in system_prompt
    assert "If the user asks which songs are available" in system_prompt


def test_chat_prompt_keeps_user_language_and_avoids_fake_ui_steps():
    russian_question = "\u0410 \u043a\u0430\u043a \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c\u0441\u044f?"

    messages = chat_service.build_messages([], russian_question)

    system_prompt = messages[0]["content"]
    language_prompt = messages[1]["content"]

    assert "Detect the language of the latest user message" in system_prompt
    assert "If the user writes in Russian, answer in Russian" in system_prompt
    assert "Do not switch to Kyrgyz" in system_prompt
    assert "Do not invent button labels" in system_prompt
    assert "If the exact UI step is not known" in system_prompt
    assert "Latest user message language: Russian" in language_prompt
    assert "Answer ONLY in Russian" in language_prompt
    assert messages[-1] == {"role": "user", "content": russian_question}


def test_chat_detects_kyrgyz_and_english_response_languages():
    kyrgyz_question = (
        "\u041a\u0430\u043d\u0442\u0438\u043f "
        "\u043a\u0430\u0442\u0442\u0430\u043b\u0441\u0430\u043c "
        "\u0431\u043e\u043b\u043e\u0442?"
    )

    kyrgyz_messages = chat_service.build_messages([], kyrgyz_question)
    english_messages = chat_service.build_messages([], "How do I register?")

    assert "Latest user message language: Kyrgyz" in kyrgyz_messages[1]["content"]
    assert "Answer ONLY in Kyrgyz" in kyrgyz_messages[1]["content"]
    assert "Latest user message language: English" in english_messages[1]["content"]
    assert "Answer ONLY in English" in english_messages[1]["content"]


def test_chat_detects_kyrgyz_song_question_without_special_letters():
    song_question = (
        "\u041a\u0430\u0439\u0441\u044b "
        "\u044b\u0440\u043b\u044b\u0440 "
        "\u0431\u0443\u043b "
        "\u0436\u0435\u0440\u0434\u0435 "
        "\u0431\u0430\u0440 "
        "\u044d\u043b\u0435"
    )

    messages = chat_service.build_messages([], song_question)
    fallback_answer = chat_service.build_local_fallback_answer(song_question)

    assert "Latest user message language: Kyrgyz" in messages[1]["content"]
    assert "Answer ONLY in Kyrgyz" in messages[1]["content"]
    assert "\u0414\u0430, \u044f \u043f\u043e\u043c\u043e\u0433\u0443" not in fallback_answer
    assert "\u044b\u0440" in fallback_answer.lower()


def test_chat_gives_useful_kyrgyz_answer_for_song_list_question():
    song_question = (
        "\u041a\u0430\u0439\u0441\u044b "
        "\u044b\u0440\u043b\u044b\u0440 "
        "\u0431\u0443\u043b "
        "\u0436\u0435\u0440\u0434\u0435 "
        "\u0431\u0430\u0440 "
        "\u044d\u043b\u0435"
    )

    fallback_answer = chat_service.build_local_fallback_answer(song_question)

    assert "Songs" in fallback_answer
    assert "\u0442\u0438\u0437\u043c\u0435" in fallback_answer.lower()
    assert "\u043e\u0439\u043b\u043e\u043f \u0442\u0430\u043f\u043f\u0430\u0439\u043c" in fallback_answer.lower()
    assert "\u0414\u0430, \u044f" not in fallback_answer


def test_default_ai_provider_uses_lowest_cost_gemini_model(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    monkeypatch.delenv("AI_BASE_URL", raising=False)
    monkeypatch.delenv("AI_MODEL", raising=False)
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.ai_provider == "gemini"
    assert settings.ai_model == "gemini-2.5-flash-lite"
    assert settings.ai_base_url == "https://generativelanguage.googleapis.com/v1beta"


def test_gemini_payload_contains_system_instruction_and_chat_history():
    hello_ru = "\u041f\u0440\u0438\u0432\u0435\u0442"
    hello_kg = "\u0421\u0430\u043b\u0430\u043c!"
    question = "\u0427\u0442\u043e \u0442\u0430\u043a\u043e\u0435 El Zaman?"
    messages = chat_service.build_messages(
        [
            ChatHistoryMessage(role="user", content=hello_ru),
            ChatHistoryMessage(role="assistant", content=hello_kg),
        ],
        question,
    )

    payload = chat_service.build_gemini_payload(messages)

    system_text = payload["system_instruction"]["parts"][0]["text"]
    assert messages[0]["content"] in system_text
    assert messages[1]["content"] in system_text
    assert payload["contents"][0] == {"role": "user", "parts": [{"text": hello_ru}]}
    assert payload["contents"][1] == {"role": "model", "parts": [{"text": hello_kg}]}
    assert payload["contents"][2] == {"role": "user", "parts": [{"text": question}]}
    assert payload["generationConfig"]["temperature"] == 0.3


def test_gemini_quota_limit_returns_local_russian_fallback(monkeypatch):
    class FakeResponse:
        status_code = 429

        def json(self):
            return {
                "error": {
                    "status": "RESOURCE_EXHAUSTED",
                    "message": "Quota exceeded for generate_content_free_tier_requests",
                }
            }

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(chat_service.httpx, "AsyncClient", FakeAsyncClient)

    settings = replace(get_settings(), ai_api_key="test-key")
    messages = chat_service.build_messages(
        [],
        "\u0410 \u043a\u0430\u043a \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c\u0441\u044f?",
    )

    answer = anyio.run(chat_service.post_gemini_generate_content, settings, messages)

    assert "\u043a\u0432\u043e\u0442" not in answer.lower()
    assert "\u0437\u0430\u0440\u0435\u0433" in answer.lower()
    assert "Sign up" in answer


def test_song_list_question_uses_local_answer_without_ai(monkeypatch):
    async def fail_post_gemini_generate_content(settings, messages):
        raise AssertionError("AI should not be called for song list fallback")

    monkeypatch.setattr(chat_service, "post_gemini_generate_content", fail_post_gemini_generate_content)

    settings = replace(get_settings(), ai_api_key="test-key", ai_provider="gemini")
    messages = chat_service.build_messages(
        [],
        (
            "\u041a\u0430\u0439\u0441\u044b "
            "\u044b\u0440\u043b\u044b\u0440 "
            "\u0431\u0443\u043b "
            "\u0436\u0435\u0440\u0434\u0435 "
            "\u0431\u0430\u0440 "
            "\u044d\u043b\u0435"
        ),
    )

    answer = anyio.run(chat_service.post_chat_completion, settings, messages)

    assert "Songs" in answer
    assert "\u043e\u0439\u043b\u043e\u043f \u0442\u0430\u043f\u043f\u0430\u0439\u043c" in answer.lower()


def test_chat_rate_limits_by_client_ip(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "test-key")
    client = _client(monkeypatch)

    async def fake_post_chat_completion(settings, messages):
        return "ok"

    monkeypatch.setattr(chat_service, "post_chat_completion", fake_post_chat_completion)

    for index in range(10):
        response = client.post("/api/chat/messages", json={"message": f"Question {index}?", "history": []})
        assert response.status_code == 200

    limited_response = client.post("/api/chat/messages", json={"message": "One more?", "history": []})

    assert limited_response.status_code == 429
    assert limited_response.json()["detail"] == "Too many chat messages. Please try again later."
