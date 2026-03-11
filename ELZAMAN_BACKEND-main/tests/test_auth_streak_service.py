from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.modules.auth.service import update_visit_streak


def _user(
    *,
    timezone_name: str = "UTC",
    streak_current: int = 0,
    streak_best: int = 0,
    streak_last_local_date: date | None = None,
):
    return SimpleNamespace(
        timezone=timezone_name,
        streak_current=streak_current,
        streak_best=streak_best,
        streak_last_local_date=streak_last_local_date,
    )


def test_update_visit_streak_first_visit():
    user = _user()

    changed = update_visit_streak(user, now=datetime(2026, 2, 24, 9, 0, tzinfo=timezone.utc))

    assert changed is True
    assert user.streak_current == 1
    assert user.streak_best == 1
    assert user.streak_last_local_date == date(2026, 2, 24)


def test_update_visit_streak_same_day_does_not_change():
    user = _user(streak_current=4, streak_best=4, streak_last_local_date=date(2026, 2, 24))

    changed = update_visit_streak(user, now=datetime(2026, 2, 24, 22, 0, tzinfo=timezone.utc))

    assert changed is False
    assert user.streak_current == 4
    assert user.streak_best == 4
    assert user.streak_last_local_date == date(2026, 2, 24)


def test_update_visit_streak_consecutive_day_increments():
    user = _user(streak_current=2, streak_best=3, streak_last_local_date=date(2026, 2, 23))

    changed = update_visit_streak(user, now=datetime(2026, 2, 24, 1, 0, tzinfo=timezone.utc))

    assert changed is True
    assert user.streak_current == 3
    assert user.streak_best == 3
    assert user.streak_last_local_date == date(2026, 2, 24)


def test_update_visit_streak_gap_resets_current_but_keeps_best():
    user = _user(streak_current=7, streak_best=9, streak_last_local_date=date(2026, 2, 20))

    changed = update_visit_streak(user, now=datetime(2026, 2, 24, 1, 0, tzinfo=timezone.utc))

    assert changed is True
    assert user.streak_current == 1
    assert user.streak_best == 9
    assert user.streak_last_local_date == date(2026, 2, 24)


def test_update_visit_streak_uses_user_timezone():
    user = _user(
        timezone_name="Asia/Bishkek",
        streak_current=5,
        streak_best=6,
        streak_last_local_date=date(2026, 2, 24),
    )

    changed = update_visit_streak(user, now=datetime(2026, 2, 24, 18, 30, tzinfo=timezone.utc))

    assert changed is True
    assert user.streak_current == 6
    assert user.streak_best == 6
    assert user.streak_last_local_date == date(2026, 2, 25)


def test_update_visit_streak_ignores_backward_local_date():
    user = _user(
        timezone_name="America/Los_Angeles",
        streak_current=4,
        streak_best=8,
        streak_last_local_date=date(2026, 2, 25),
    )

    changed = update_visit_streak(user, now=datetime(2026, 2, 25, 1, 0, tzinfo=timezone.utc))

    assert changed is False
    assert user.streak_current == 4
    assert user.streak_best == 8
    assert user.streak_last_local_date == date(2026, 2, 25)
