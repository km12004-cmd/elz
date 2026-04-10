from fastapi.testclient import TestClient

import app.main


def _route_map():
    mapping = {}
    for route in app.main.app.routes:
        if not hasattr(route, "methods"):
            continue
        methods = {method.upper() for method in route.methods}
        mapping.setdefault(route.path, set()).update(methods)
    return mapping


def test_required_api_routes_present():
    routes = _route_map()
    required = {
        "/api/capabilities": {"GET"},
        "/api/auth/register": {"POST"},
        "/api/auth/login": {"POST"},
        "/api/auth/refresh": {"POST"},
        "/api/auth/logout": {"POST"},
        "/api/auth/me": {"GET"},
        "/api/profile": {"GET"},
        "/api/profile/nickname": {"POST"},
        "/api/profile/timezone": {"POST"},
        "/api/profile/delete/request": {"POST"},
        "/api/subscriptions/telegram-link": {"POST"},
        "/api/telegram/webhook": {"POST"},
        "/api/flashcards/due": {"GET"},
        "/api/flashcards/{flashcard_id}/review": {"POST"},
        "/api/flashcards/folders": {"GET", "POST"},
        "/api/flashcards/folders/{folder_id}": {"GET", "DELETE"},
        "/api/flashcards/folders/{folder_id}/cards": {"POST"},
        "/api/flashcards/folders/{folder_id}/cards/{card_id}": {"DELETE"},
        "/api/playlists": {"GET", "POST"},
        "/api/playlists/{playlist_id}": {"GET", "DELETE"},
        "/api/playlists/{playlist_id}/songs": {"GET", "POST"},
        "/api/playlists/{playlist_id}/songs/{song_id}": {"DELETE"},
        "/api/songs": {"GET", "POST"},
        "/api/songs/{song_id}": {"GET", "PATCH", "DELETE"},
        "/api/songs/{song_id}/lyrics": {"GET"},
        "/api/artists": {"GET", "POST"},
        "/api/artists/{artist_id}": {"GET", "PATCH", "DELETE"},
        "/api/tracks/{track_id}/start-learning": {"POST"},
        "/api/tracks/{track_id}/learning-state": {"GET"},
        "/api/tracks/{track_id}/flashcard-templates": {"GET", "POST"},
        "/api/tracks/{track_id}/levels/{level}/cards": {"GET"},
        "/api/tracks/{track_id}/listened": {"POST"},
        "/api/tracks/{track_id}/games/pairs/templates": {"GET", "POST"},
        "/api/tracks/{track_id}/games/pairs/{exercise_idx}/templates": {"GET", "POST"},
        "/api/tracks/{track_id}/games/pairs/start": {"POST"},
        "/api/tracks/{track_id}/games/pairs/{exercise_idx}/start": {"POST"},
        "/api/games/pairs/{session_id}/answer": {"POST"},
        "/api/games/pairs/{session_id}/finish": {"POST"},
        "/api/games/pairs/{session_id}": {"GET"},
    }

    missing = []
    for path, methods in required.items():
        if path not in routes:
            missing.append(f"{path} (missing path)")
            continue
        if not methods.issubset(routes[path]):
            missing.append(f"{path} (missing methods {methods - routes[path]})")

    assert not missing, "Missing API routes: " + ", ".join(missing)


def test_html_template_routes_removed():
    routes = _route_map()
    removed = {
        "/",
        "/register",
        "/login",
        "/profile",
        "/levels",
        "/playlists",
        "/songs/upload",
        "/forgot",
        "/reset",
        "/achievements",
    }

    still_present = sorted(path for path in removed if path in routes)
    assert not still_present, f"HTML routes still present: {still_present}"


def test_capabilities_smoke():
    client = TestClient(app.main.app)
    response = client.get("/api/capabilities")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True


def test_docs_uses_local_swagger_assets():
    client = TestClient(app.main.app)
    docs_response = client.get("/docs")
    assert docs_response.status_code == 200
    assert "/_docs_assets/swagger-ui/swagger-ui-bundle.js" in docs_response.text
    assert "/_docs_assets/swagger-ui/swagger-ui.css" in docs_response.text


def test_local_swagger_asset_is_served():
    client = TestClient(app.main.app)
    js_response = client.get("/_docs_assets/swagger-ui/swagger-ui-bundle.js")
    assert js_response.status_code == 200


def test_openapi_version_is_swagger_compatible():
    client = TestClient(app.main.app)
    openapi_response = client.get("/openapi.json")
    assert openapi_response.status_code == 200
    payload = openapi_response.json()
    assert payload.get("openapi", "").startswith("3.0.")
