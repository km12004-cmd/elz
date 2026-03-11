import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.modules.xp.service import (
    LEVEL_THRESHOLDS,
    MIN_SECONDS_ON_PAGE,
    XP_SONG_COMPLETED,
    XP_TASK_COMPLETED,
    build_progress_payload,
    level_from_xp,
)


# ---------------------------------------------------------------------------
# level_from_xp — pure function
# ---------------------------------------------------------------------------

def test_level_from_xp_new_user():
    assert level_from_xp(0) == 1


def test_level_from_xp_below_first_threshold():
    assert level_from_xp(LEVEL_THRESHOLDS[1] - 1) == 1


def test_level_from_xp_at_first_threshold():
    assert level_from_xp(LEVEL_THRESHOLDS[1]) == 2


def test_level_from_xp_between_levels():
    assert level_from_xp(LEVEL_THRESHOLDS[1] + 1) == 2


def test_level_from_xp_at_max_threshold():
    assert level_from_xp(LEVEL_THRESHOLDS[-1]) == len(LEVEL_THRESHOLDS)


def test_level_from_xp_beyond_max():
    assert level_from_xp(LEVEL_THRESHOLDS[-1] + 99999) == len(LEVEL_THRESHOLDS)


# ---------------------------------------------------------------------------
# build_progress_payload — pure function
# ---------------------------------------------------------------------------

def test_build_progress_new_user():
    p = build_progress_payload(experience=0)
    assert p["level"] == 1
    assert p["xp_total"] == 0
    assert p["next_level"] == 2
    assert p["next_level_threshold"] == LEVEL_THRESHOLDS[1]
    assert p["xp_to_next_level"] == LEVEL_THRESHOLDS[1]


def test_build_progress_at_threshold():
    xp = LEVEL_THRESHOLDS[1]  # exactly level 2
    p = build_progress_payload(experience=xp)
    assert p["level"] == 2
    assert p["xp_total"] == xp
    assert p["xp_to_next_level"] == LEVEL_THRESHOLDS[2] - xp


def test_build_progress_at_max_level():
    max_xp = LEVEL_THRESHOLDS[-1]
    p = build_progress_payload(experience=max_xp)
    assert p["level"] == len(LEVEL_THRESHOLDS)
    assert p["xp_to_next_level"] == 0


# ---------------------------------------------------------------------------
# complete_song — async, uses mock DB
# ---------------------------------------------------------------------------

def _make_db_returning_none():
    """Returns an AsyncSession mock whose execute() yields scalar_one_or_none() == None."""
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db = AsyncMock()
    db.execute.return_value = result_mock
    return db


def _make_db_with_page_session(opened_at: datetime):
    """Returns an AsyncSession mock whose execute() yields a SongPageSession stub."""
    session_stub = MagicMock()
    session_stub.opened_at = opened_at

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = session_stub

    db = AsyncMock()
    db.execute.return_value = result_mock
    return db


def test_complete_song_raises_if_not_opened():
    async def run():
        from app.modules.xp.service import complete_song
        db = _make_db_returning_none()
        # db.get() is used internally to check song existence but here the
        # page-session lookup is the first execute() call.
        with pytest.raises(HTTPException) as exc_info:
            await complete_song(db, user_id=1, song_id=99)
        assert exc_info.value.status_code == 400
        assert "not opened" in exc_info.value.detail

    asyncio.run(run())


def test_complete_song_raises_if_too_soon():
    async def run():
        from app.modules.xp.service import complete_song
        recent = datetime.now(timezone.utc) - timedelta(seconds=MIN_SECONDS_ON_PAGE - 5)
        db = _make_db_with_page_session(opened_at=recent)
        with pytest.raises(HTTPException) as exc_info:
            await complete_song(db, user_id=1, song_id=1)
        assert exc_info.value.status_code == 400
        assert "too soon" in exc_info.value.detail

    asyncio.run(run())


# ---------------------------------------------------------------------------
# XP constants sanity checks
# ---------------------------------------------------------------------------

def test_xp_constants_are_positive():
    assert XP_SONG_COMPLETED > 0
    assert XP_TASK_COMPLETED > 0
    assert MIN_SECONDS_ON_PAGE > 0


def test_level_thresholds_are_strictly_increasing():
    for i in range(1, len(LEVEL_THRESHOLDS)):
        assert LEVEL_THRESHOLDS[i] > LEVEL_THRESHOLDS[i - 1]
