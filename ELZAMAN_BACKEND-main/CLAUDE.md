# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload

# Run tests
pytest

# Run a single test file
pytest tests/test_security_jwt.py -v

# Database migrations
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1
```

## Architecture

This is a **FastAPI + async SQLAlchemy 2.0 + PostgreSQL** backend for a language-learning platform (Kyrgyz/Russian).

### Entry Points

- [app/main.py](app/main.py) — FastAPI app creation, mounts `/media`, registers exception handlers, includes `/api` router
- [app/api/router.py](app/api/router.py) — Combines all module routers
- [app/core/lifespan.py](app/core/lifespan.py) — DB initialization and backfill migrations on startup

### Module Layout

Feature modules live in [app/modules/](app/modules/) and each follows this pattern:

```
module/
├── router.py       # FastAPI APIRouter with endpoints
├── schemas.py      # Pydantic request/response models
├── service.py      # Business logic
└── crud.py         # Database queries (when present)
```

Modules: `auth`, `profile`, `general`, `flashcards`, `playlists`, `songs`, `tracks` (Exercise 1), `exercise2` (pairs game), `subscriptions`.

### Key Subsystems

**Authentication** ([app/core/security.py](app/core/security.py))
- JWT access tokens (HS256, 3 day TTL) via `Authorization: Bearer <token>`
- Refresh tokens stored in HttpOnly cookies with rotation
- Revokable sessions tracked in `refresh_sessions` table

**Database** ([app/db/](app/db/))
- All queries use `AsyncSession` from `asyncpg`
- `get_db()` dependency in [app/db/session.py](app/db/session.py) yields sessions
- Models in [app/db/models.py](app/db/models.py) — single file for all tables

**Storage** ([app/services/storage.py](app/services/storage.py))
- Abstraction supporting local filesystem or AWS S3
- Controlled by `STORAGE_BACKEND=local|s3` env var

**Spaced Repetition** — Leitner system implemented in the flashcards module

**Pairs Game (Exercise 2+)** — Seed-based shuffling for deterministic round generation; sessions tracked in `user_game_sessions` / `user_game_answers`

### Environment Variables

The app reads from `.env`. Key variables:

```
DATABASE_URL=postgresql+asyncpg://...
JWT_SECRET_KEY=...
APP_SECRET_KEY=...
ACCESS_TOKEN_TTL_MINUTES=4320
REFRESH_TOKEN_TTL_DAYS=14
STORAGE_BACKEND=local
MEDIA_ROOT=app/media
MEDIA_URL_PREFIX=/media
```

### API Prefixes

| Prefix | Module |
|--------|--------|
| `/api/auth` | Auth (register, login, refresh, logout, me) |
| `/api/profile` | User profile |
| `/api/flashcards` | Flashcard folders and spaced repetition |
| `/api/playlists` | Playlist CRUD |
| `/api/songs` | Song management |
| `/api/tracks` | Exercise 1 (learning flow) |
| `/api/games/pairs` | Exercise 2+ (pairs matching game) |
| `/api/capabilities` | Service metadata |

Full endpoint documentation is in [API_REFERENCE.md](API_REFERENCE.md).
