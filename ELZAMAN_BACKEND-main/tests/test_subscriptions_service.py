import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.modules.subscriptions.service import ensure_song_study_access


def test_ensure_song_study_access_blocks_latest_song_for_non_premium_user():
    async def run():
        db = MagicMock()
        premium_result = MagicMock()
        premium_result.scalar_one_or_none.return_value = None
        locked_songs_result = MagicMock()
        locked_songs_result.all.return_value = [(9,), (8,), (7,), (6,)]
        db.execute = AsyncMock(side_effect=[premium_result, locked_songs_result])

        user = SimpleNamespace(id=5, is_admin=lambda: False)

        with pytest.raises(HTTPException) as exc:
            await ensure_song_study_access(db, user, 8)

        assert exc.value.status_code == 403
        assert exc.value.detail == "premium subscription is required to study this song"

    asyncio.run(run())


def test_ensure_song_study_access_allows_premium_user():
    async def run():
        db = MagicMock()
        premium_result = MagicMock()
        premium_result.scalar_one_or_none.return_value = object()
        db.execute = AsyncMock(return_value=premium_result)

        user = SimpleNamespace(id=5, is_admin=lambda: False)

        await ensure_song_study_access(db, user, 8)

        db.execute.assert_awaited_once()

    asyncio.run(run())


def test_ensure_song_study_access_skips_admin_user():
    async def run():
        db = MagicMock()
        db.execute = AsyncMock()

        user = SimpleNamespace(id=1, is_admin=lambda: True)

        await ensure_song_study_access(db, user, 8)

        db.execute.assert_not_awaited()

    asyncio.run(run())
