# API Reference (Elzaman)

This project now exposes a JSON-only API.

- Primary API: `/api/*`
- HTML/Jinja pages and template/form routes were removed.

## Authentication Standard

- Passwords are stored as bcrypt hashes.
- Access token is a URL-safe JWT string (`HS256`, Base64URL segments).
- Header format is strict:
  - `Authorization: Bearer <token>`
  - no quotes, no `b'...'`, no extra spaces.
- Refresh flow uses HttpOnly cookie (`REFRESH_COOKIE_NAME`) via refresh endpoints.

## General

- `GET /api/capabilities`
  - Returns grouped capabilities and endpoint map.

## Auth (`/api/auth`)

- `POST /register`
  - Body: `first_name, last_name, nickname, email, password, gender, birth_date`
  - Returns: `{ ok: true, user_id }`

- `POST /login`
  - Body: `email, password`
  - Returns: `{ ok, token_type, access_token, access_expires_at }`
  - Also sets refresh cookie.

- `POST /refresh`
  - Body: none (reads refresh cookie)
  - Returns: `{ ok, token_type, access_token, access_expires_at }`

- `POST /logout`
  - Revokes refresh session and clears auth cookies.
  - Returns: `{ ok: true }`

- `GET /me`
  - Returns current authenticated user identity.
  - Includes `created_at` (UTC ISO-8601) and `role` (`user`/`admin`).

## Chat (`/api/chat`)

- `POST /messages`
  - Body: `{ message, history }`, where `history` is up to 6 `{ role, content }` items.
  - Returns: `{ ok: true, answer }`.
  - Proxies to an OpenAI-compatible provider using server-side `AI_API_KEY`.
  - Returns `503` when AI env settings are missing and `429` when the in-memory rate limit is exceeded.

## Profile (`/api/profile`)

- `GET /`
  - Returns profile and premium status.
  - Includes `created_at` (UTC ISO-8601) and `role` (`user`/`admin`).

- `POST /nickname`
  - Body: `nickname`
  - Updates nickname.

- `POST /timezone`
  - Body: `timezone` (IANA name, e.g. `Asia/Bishkek`)
  - Updates profile timezone (limited by cooldown).

- `POST /delete/request`
  - Body: `password`
  - Marks account as pending deletion and revokes sessions.

## Flashcards (`/api/flashcards`)

- `GET /folders`
  - Returns user folders with `cards_count`.

- `POST /folders`
  - Body: `title`
  - Creates folder.

- `DELETE /folders/{folder_id}`
  - Deletes folder with cascade delete for its cards.

- `GET /folders/{folder_id}`
  - Returns folder and cards list.

- `POST /folders/{folder_id}/cards`
  - Body: `front, back`
  - Creates card in folder.

- `DELETE /folders/{folder_id}/cards/{card_id}`
  - Deletes card in folder.

- `GET /due`
  - Returns due flashcards for current user.

- `POST /{flashcard_id}/review`
  - Body: `correct: bool`
  - Updates stage and next due date via Leitner-like schedule.

### Flashcards Folder Flow (curl)

```bash
# 1) create folder
curl -X POST "http://localhost:8000/api/flashcards/folders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Spanish A1"}'

# 2) list folders
curl "http://localhost:8000/api/flashcards/folders" \
  -H "Authorization: Bearer $TOKEN"

# 3) create card in folder (replace FOLDER_ID)
curl -X POST "http://localhost:8000/api/flashcards/folders/FOLDER_ID/cards" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"front":"hola","back":"привет"}'

# 4) get folder detail with cards
curl "http://localhost:8000/api/flashcards/folders/FOLDER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## Playlists (`/api/playlists`)

- `GET /`
  - Returns user playlists.

- `POST /`
  - Body: `title, description?`
  - Creates playlist.

- `GET /{playlist_id}`
  - Returns playlist details, songs, and available unlocked songs.

- `GET /{playlist_id}/songs`
  - Returns only songs that are already in the playlist.
  - Each item includes song fields + relation metadata (`position`, `added_at`).

- `POST /{playlist_id}/songs`
  - Body: `song_id`
  - Adds song to playlist.
  - Returns `201` on success.
  - Returns `409` if song already exists in this playlist.

- `DELETE /{playlist_id}/songs/{song_id}`
  - Removes song from playlist.
  - Returns `404` if this song is not linked to this playlist.

- `DELETE /{playlist_id}`
  - Deletes playlist and linked playlist-song rows.

## Songs (`/api/songs`)

- `POST /`
  - Body: `title, author, lyrics_text`
  - Optional: `youtube_url, difficulty_level(1|2|3), original_language, release_year, duration_seconds, is_published`
  - Creates song with artist (creates artist automatically if missing).

- `GET /`
  - Query: `limit, offset, q`
  - Returns song list with author/title/text and extra metadata.

- `GET /{song_id}`
  - Returns one song with full data.

- `PATCH /{song_id}`
  - Body: any subset of `title, author, lyrics_text, youtube_url, difficulty_level, original_language, release_year, duration_seconds, is_published`
  - Updates only provided fields.

- `GET /{song_id}/lyrics`
  - Returns lyrics text for unlocked songs only.

## Artists (`/api/artists`)

- `POST /`
  - Body: `name`
  - Optional: `bio, avatar_url`
  - Creates artist.

- `GET /`
  - Query: `limit, offset, q`
  - Returns artists list with pagination.

- `GET /{artist_id}`
  - Returns one artist.

- `PATCH /{artist_id}`
  - Body: any subset of `name, bio, avatar_url`
  - Updates only provided fields.

- `DELETE /{artist_id}`
  - Deletes artist if no linked songs.

## Exercise 1 / Tracks (`/api/tracks`)

- `POST /{track_id}/start-learning`
  - Atomic operation behind "Ready to learn":
    1. Upserts user progress for track (`status=learning`, `unlocked_level>=1`, `unlocked_game>=1`)
    2. Finds or creates user flashcards folder linked to track
    3. Copies templates from `track_flashcard_templates` into folder cards
  - Idempotent: repeated call does not duplicate folder/cards.
  - Response:
    - `track_id`
    - `unlocked_level`
    - `unlocked_game`
    - `folder_id`
    - `cards_added`
    - `cards_existing`

- `GET /{track_id}/learning-state`
  - Returns:
    - `status`: `not_started | listened | learning | finished`
    - `unlocked_level`
    - `unlocked_game`
    - `folder_id`

- `GET /{track_id}/flashcard-templates`
  - Query: `level` (optional, `>=1`)
  - Returns template list for preview/admin:
    - `id`
    - `level`
    - `kg_text`
    - `ru_text`
    - `order`

- `POST /{track_id}/flashcard-templates`
  - Manual add of words/phrases templates.
  - Body:
    - `items`: array of `{ kg_text, ru_text, order>=1, level>=1 }`
  - Response:
    - `track_id`
    - `created_ids`
    - `created_count`

- `GET /{track_id}/levels/{level}/cards`
  - Returns all word cards templates for selected level.
  - Response:
    - `track_id`
    - `level`
    - `items` (same shape as templates list)

- `POST /{track_id}/listened`
  - Optional helper endpoint for marking song listened.
  - Body: `percent` (0..100) and/or `seconds_listened`.
  - If threshold is reached (~90%), marks track as `listened`.
  - Returns: `track_id, status, unlocked_level, unlocked_game, folder_id`.

## Exercise Templates (Unified)

- `GET /api/tracks/{track_id}/exercises/{exercise_idx}/templates`
  - Unified template list for all exercises.
  - `exercise_idx = 1` maps to flashcard templates (optional `level>=1`).
  - `exercise_idx >= 2` maps to pairs templates.
  - Response item: `id, exercise, level?, kg_text, ru_text, order`.

- `POST /api/tracks/{track_id}/exercises/{exercise_idx}/templates`
  - Unified template create for all exercises.
  - Body: `items` array of `{ kg_text, ru_text, order>=1, level? }`.
  - Response: `track_id, exercise, created_ids, created_count`.

## Exercise 2/3 / Pairs Game

- `GET /api/tracks/{track_id}/games/pairs/templates`
  - Legacy alias for exercise 2 templates.
  - Equivalent to `GET /api/tracks/{track_id}/games/pairs/2/templates`.

- `GET /api/tracks/{track_id}/games/pairs/{exercise_idx}/templates`
  - Returns KG→RU templates for selected pairs exercise (`exercise_idx >= 2`).
  - Response item: `id, exercise, kg_text, ru_text, order`.

- `POST /api/tracks/{track_id}/games/pairs/templates`
  - Legacy alias for adding templates to exercise 2.
  - Equivalent to `POST /api/tracks/{track_id}/games/pairs/2/templates`.

- `POST /api/tracks/{track_id}/games/pairs/{exercise_idx}/templates`
  - Manual add for selected pairs exercise (`exercise_idx >= 2`).
  - Body: `items` array of `{ kg_text, ru_text, order>=1 }`.
  - Uniqueness is by normalized KG text inside selected exercise.
  - Response: `track_id, exercise, created_ids, created_count`.

- `POST /api/tracks/{track_id}/games/pairs/start`
  - Legacy alias for starting exercise 2.
  - Equivalent to `POST /api/tracks/{track_id}/games/pairs/2/start`.

- `POST /api/tracks/{track_id}/games/pairs/{exercise_idx}/start`
  - Creates new in-progress session or returns existing active session for this user+track+exercise.
  - Requires Exercise 1 to be started for this track.
  - For `exercise_idx > 2`, requires previous game progression (`unlocked_game >= exercise_idx`).
  - Returns game payload:
    - `session_id`
    - `track_id`
    - `exercise`
    - `items`: left column (`pair_id`, `left`)
    - `options`: shuffled right options (`option_id`, `text`) by stored `seed`.

- `POST /api/games/pairs/{session_id}/answer`
  - Body: `{ pair_id, option_id }`.
  - Validates answer on backend (`option_id` belongs to same track).
  - Upserts answer by unique key `(session_id, pair_id)` (repeat call rewrites choice).
  - Response: `{ pair_id, option_id, correct }`.

- `POST /api/games/pairs/{session_id}/finish`
  - Calculates result and marks session as completed.
  - Response: `{ exercise, correct, total, passed }`.
  - `passed` is based on backend threshold (80% and above).
  - On pass opens next game step (`unlocked_game = max(current, exercise + 1)`).

- `GET /api/games/pairs/{session_id}`
  - Returns current session status/progress.
  - Response: `session_id, track_id, exercise, status, answered_count, total, remaining, answers[]`.
