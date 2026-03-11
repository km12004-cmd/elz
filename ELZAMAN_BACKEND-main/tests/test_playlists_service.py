import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.modules.playlists.service import add_song_to_playlist, remove_song_from_playlist


class _DummyAsyncContextManager:
    async def __aenter__(self):  # noqa: ANN204
        return None

    async def __aexit__(self, exc_type, exc, tb):  # noqa: ANN204, ANN001
        return False



def test_add_song_to_playlist_raises_404_when_song_missing():
    async def run():
        db = MagicMock()
        db.get = AsyncMock(return_value=None)

        with patch("app.modules.playlists.service.get_user_playlist", new=AsyncMock(return_value=MagicMock())):
            with pytest.raises(HTTPException) as exc:
                await add_song_to_playlist(db, playlist_id=10, user_id=1, song_id=99)

        assert exc.value.status_code == 404
        assert exc.value.detail == "song not found"

    asyncio.run(run())


def test_add_song_to_playlist_raises_409_when_song_already_in_playlist():
    async def run():
        db = MagicMock()
        db.get = AsyncMock(return_value=MagicMock())
        max_position_result = MagicMock()
        max_position_result.scalar_one_or_none.return_value = 2
        db.execute = AsyncMock(return_value=max_position_result)
        db.add = MagicMock()
        db.flush = AsyncMock(side_effect=IntegrityError("insert", {}, Exception("duplicate")))
        db.begin_nested = MagicMock(return_value=_DummyAsyncContextManager())

        with patch("app.modules.playlists.service.get_user_playlist", new=AsyncMock(return_value=MagicMock())):
            with pytest.raises(HTTPException) as exc:
                await add_song_to_playlist(db, playlist_id=10, user_id=1, song_id=20)

        assert exc.value.status_code == 409
        assert exc.value.detail == "playlist song already exists"

    asyncio.run(run())


def test_remove_song_from_playlist_raises_404_when_relation_missing():
    async def run():
        db = MagicMock()
        delete_result = MagicMock()
        delete_result.rowcount = 0
        db.execute = AsyncMock(return_value=delete_result)

        with patch("app.modules.playlists.service.get_user_playlist", new=AsyncMock(return_value=MagicMock())):
            with pytest.raises(HTTPException) as exc:
                await remove_song_from_playlist(db, playlist_id=10, user_id=1, song_id=20)

        assert exc.value.status_code == 404
        assert exc.value.detail == "playlist song not found"

    asyncio.run(run())
