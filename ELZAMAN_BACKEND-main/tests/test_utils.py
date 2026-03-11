from datetime import datetime, timezone

from app.utils.datetime import to_iso, to_iso_optional, utcnow
from app.utils.text import APOSTROPHE_VARIANTS, normalize_kyrgyz_text


def test_utcnow_returns_aware_datetime():
    now = utcnow()
    assert now.tzinfo is not None
    assert now.tzinfo == timezone.utc


def test_to_iso_naive_datetime():
    dt = datetime(2024, 1, 15, 12, 0, 0)
    assert to_iso(dt) == "2024-01-15T12:00:00Z"


def test_to_iso_aware_datetime():
    dt = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
    assert to_iso(dt) == "2024-01-15T12:00:00Z"


def test_to_iso_optional_none():
    assert to_iso_optional(None) is None


def test_to_iso_optional_value():
    dt = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
    assert to_iso_optional(dt) == "2024-01-15T12:00:00Z"


def test_normalize_kyrgyz_text_basic():
    assert normalize_kyrgyz_text("  \u00ab\u041e\u2019\u0448\u043e\u043b-\u0416\u043e\u043b!\u00bb  ") == "\u043e'\u0448\u043e\u043b-\u0436\u043e\u043b"


def test_normalize_kyrgyz_text_apostrophe_variants():
    for variant in APOSTROPHE_VARIANTS:
        result = normalize_kyrgyz_text(f"a{variant}b")
        assert result == "a'b", f"Failed for variant {repr(variant)}"


def test_normalize_kyrgyz_text_collapses_whitespace():
    assert normalize_kyrgyz_text("  foo   bar  ") == "foo bar"
