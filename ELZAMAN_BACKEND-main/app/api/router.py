from fastapi import APIRouter

from app.modules.achievements.router import router as achievements_router
from app.modules.admin.router import router as admin_router
from app.modules.artists.router import router as artists_router
from app.modules.auth.router import router as auth_router
from app.modules.exercise2.router import router as exercise2_router
from app.modules.exercises.router import router as exercises_router
from app.modules.flashcards.router import router as flashcards_router
from app.modules.lyrics.router import router as lyrics_router
from app.modules.general.router import router as general_router
from app.modules.playlists.router import router as playlists_router
from app.modules.profile.router import router as profile_router
from app.modules.songs.router import router as songs_router
from app.modules.subscriptions.router import router as subscriptions_router
from app.modules.telegram.router import router as telegram_router
from app.modules.tracks.router import router as tracks_router
from app.modules.xp.router import router as xp_router

api_router = APIRouter()
api_router.include_router(achievements_router)
api_router.include_router(general_router)
api_router.include_router(auth_router)
api_router.include_router(profile_router)
api_router.include_router(flashcards_router)
api_router.include_router(playlists_router)
api_router.include_router(songs_router)
api_router.include_router(artists_router)
api_router.include_router(subscriptions_router)
api_router.include_router(telegram_router)
api_router.include_router(tracks_router)
api_router.include_router(exercise2_router)
api_router.include_router(exercises_router)
api_router.include_router(xp_router)
api_router.include_router(lyrics_router)
api_router.include_router(admin_router)
