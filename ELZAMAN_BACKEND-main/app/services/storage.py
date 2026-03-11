import os
from pathlib import Path

STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local").strip().lower()
MEDIA_URL_PREFIX = os.getenv("MEDIA_URL_PREFIX", "/media")
MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", Path(__file__).resolve().parents[1] / "media"))
SONGS_MEDIA_DIR = MEDIA_ROOT / "songs"


def ensure_media_dirs() -> None:
    if STORAGE_BACKEND != "local":
        return
    MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
    SONGS_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
