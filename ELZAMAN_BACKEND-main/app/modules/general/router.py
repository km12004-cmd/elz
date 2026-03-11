from fastapi import APIRouter

router = APIRouter(tags=["General"])


@router.get("/capabilities")
async def capabilities():
    return {
        "ok": True,
        "version": "stable",
        "notes": {
            "api_prefix": "All routes are under /api/*.",
            "auth": "Use Authorization: Bearer <access_token> with strict format.",
        },
        "capabilities": [
            {
                "area": "Auth",
                "endpoints": [
                    "POST /api/auth/register",
                    "POST /api/auth/login",
                    "POST /api/auth/refresh",
                    "POST /api/auth/logout",
                    "GET /api/auth/me",
                ],
            },
            {
                "area": "Profile",
                "endpoints": [
                    "GET /api/profile",
                    "POST /api/profile/nickname",
                    "POST /api/profile/timezone",
                    "POST /api/profile/delete/request",
                ],
            },
            {
                "area": "Flashcards",
                "endpoints": [
                    "GET /api/flashcards/folders",
                    "POST /api/flashcards/folders",
                    "DELETE /api/flashcards/folders/{folder_id}",
                    "GET /api/flashcards/folders/{folder_id}",
                    "POST /api/flashcards/folders/{folder_id}/cards",
                    "DELETE /api/flashcards/folders/{folder_id}/cards/{card_id}",
                    "GET /api/flashcards/due",
                    "POST /api/flashcards/{flashcard_id}/review",
                ],
            },
            {
                "area": "Playlists",
                "endpoints": [
                    "GET /api/playlists",
                    "POST /api/playlists",
                    "GET /api/playlists/{playlist_id}",
                    "GET /api/playlists/{playlist_id}/songs",
                    "POST /api/playlists/{playlist_id}/songs",
                    "DELETE /api/playlists/{playlist_id}/songs/{song_id}",
                    "DELETE /api/playlists/{playlist_id}",
                ],
            },
            {
                "area": "Songs",
                "endpoints": [
                    "POST /api/songs",
                    "GET /api/songs",
                    "GET /api/songs/{song_id}",
                    "PATCH /api/songs/{song_id}",
                    "GET /api/songs/{song_id}/lyrics",
                ],
            },
            {
                "area": "Exercise 1",
                "endpoints": [
                    "POST /api/tracks/{track_id}/start-learning",
                    "GET /api/tracks/{track_id}/learning-state",
                    "GET /api/tracks/{track_id}/flashcard-templates",
                    "POST /api/tracks/{track_id}/flashcard-templates",
                    "GET /api/tracks/{track_id}/levels/{level}/cards",
                    "POST /api/tracks/{track_id}/listened",
                ],
            },
            {
                "area": "Exercise 2+",
                "endpoints": [
                    "GET /api/tracks/{track_id}/games/pairs/templates",
                    "POST /api/tracks/{track_id}/games/pairs/templates",
                    "GET /api/tracks/{track_id}/games/pairs/{exercise_idx}/templates",
                    "POST /api/tracks/{track_id}/games/pairs/{exercise_idx}/templates",
                    "POST /api/tracks/{track_id}/games/pairs/start",
                    "POST /api/tracks/{track_id}/games/pairs/{exercise_idx}/start",
                    "POST /api/games/pairs/{session_id}/answer",
                    "POST /api/games/pairs/{session_id}/finish",
                    "GET /api/games/pairs/{session_id}",
                ],
            },
            {
                "area": "Exercises (Unified)",
                "endpoints": [
                    "GET /api/tracks/{track_id}/exercises/{exercise_idx}/templates",
                    "POST /api/tracks/{track_id}/exercises/{exercise_idx}/templates",
                ],
            },
        ],
    }
