from pathlib import Path

from fastapi import FastAPI
from fastapi.openapi.docs import get_swagger_ui_html, get_swagger_ui_oauth2_redirect_html
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles

from app.api import api_router
from app.core.errors import register_exception_handlers
from app.core.lifespan import lifespan
from app.services.storage import MEDIA_ROOT, MEDIA_URL_PREFIX, STORAGE_BACKEND

OPENAPI_TAGS = [
    {"name": "General", "description": "Service metadata and capabilities."},
    {"name": "Auth", "description": "Registration, login, token refresh, and auth identity."},
    {"name": "Chat", "description": "AI chat assistant proxy endpoints."},
    {"name": "Profile", "description": "Profile data and account settings."},
    {"name": "Flashcards", "description": "Flashcard review and spaced repetition."},
    {"name": "Playlists", "description": "Playlist operations."},
    {"name": "Songs", "description": "Song media and lyrics operations."},
    {"name": "Artists", "description": "Artist CRUD operations."},
    {"name": "Exercise 1", "description": "Track learning flow: start-learning, state, templates."},
    {
        "name": "Exercise 2",
        "description": "Pairs game flow for exercise 2/3+: templates, start, answer, finish, status.",
    },
    {
        "name": "Exercises",
        "description": "Unified template endpoints for exercises 1-5.",
    },
    {
        "name": "Lyrics & Translations",
        "description": "Lyrics tokenization, word-by-word translations, and dictionary management.",
    },
]

SWAGGER_ASSETS_MOUNT_PATH = "/_docs_assets/swagger-ui"

try:
    from swagger_ui_bundle import swagger_ui_path as _swagger_ui_path
except ImportError:  # pragma: no cover - optional runtime fallback
    _swagger_ui_path = None


def _register_swagger_docs(app: FastAPI) -> None:
    local_swagger_js_url: str | None = None
    local_swagger_css_url: str | None = None

    if _swagger_ui_path:
        assets_path = Path(_swagger_ui_path)
        if assets_path.exists():
            app.mount(
                SWAGGER_ASSETS_MOUNT_PATH,
                StaticFiles(directory=str(assets_path), check_dir=False),
                name="swagger_ui_assets",
            )
            local_swagger_js_url = f"{SWAGGER_ASSETS_MOUNT_PATH}/swagger-ui-bundle.js"
            local_swagger_css_url = f"{SWAGGER_ASSETS_MOUNT_PATH}/swagger-ui.css"

    @app.get("/docs", include_in_schema=False)
    async def custom_swagger_docs():
        kwargs = {
            "openapi_url": app.openapi_url,
            "title": f"{app.title} - Swagger UI",
            "oauth2_redirect_url": app.swagger_ui_oauth2_redirect_url,
        }
        if local_swagger_js_url and local_swagger_css_url:
            kwargs["swagger_js_url"] = local_swagger_js_url
            kwargs["swagger_css_url"] = local_swagger_css_url
        return get_swagger_ui_html(**kwargs)

    @app.get(app.swagger_ui_oauth2_redirect_url, include_in_schema=False)
    async def swagger_oauth2_redirect():
        return get_swagger_ui_oauth2_redirect_html()


def _register_openapi_schema(app: FastAPI) -> None:
    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema
        app.openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
            openapi_version="3.0.3",
        )
        return app.openapi_schema

    app.openapi = custom_openapi


def create_app() -> FastAPI:
    app = FastAPI(
        title="Elzaman API",
        openapi_tags=OPENAPI_TAGS,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )

    app.include_router(api_router, prefix="/api")

    if STORAGE_BACKEND == "local":
        app.mount(MEDIA_URL_PREFIX, StaticFiles(directory=str(MEDIA_ROOT), check_dir=False), name="media")

    register_exception_handlers(app)
    _register_openapi_schema(app)
    _register_swagger_docs(app)

    @app.get("/healthz", tags=["General"])
    async def healthz():
        return {"ok": True, "status": "healthy"}

    return app


app = create_app()
