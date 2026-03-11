from types import SimpleNamespace

from app.modules.exercise2.service import _build_kg_text_norm, _calc_passed, _shuffle_options
from app.utils.text import normalize_kyrgyz_text


def test_normalize_kyrgyz_text_keeps_words_and_normalizes_apostrophes():
    value = "  \u00ab\u041e\u2019\u0448\u043e\u043b-\u0416\u043e\u043b!\u00bb  "
    assert normalize_kyrgyz_text(value) == "\u043e'\u0448\u043e\u043b-\u0436\u043e\u043b"


def test_shuffle_options_is_seed_deterministic():
    pairs = [SimpleNamespace(id=i, ru_text=f"ru-{i}") for i in range(1, 9)]

    first = _shuffle_options(pairs, seed=42)
    second = _shuffle_options(pairs, seed=42)
    third = _shuffle_options(pairs, seed=43)

    assert first == second
    assert [item["option_id"] for item in first] != [item["option_id"] for item in third]


def test_calc_passed_uses_eighty_percent_threshold():
    assert _calc_passed(correct_count=5, total=6) is True
    assert _calc_passed(correct_count=4, total=6) is False


def test_build_kg_text_norm_includes_exercise_prefix():
    assert _build_kg_text_norm(" \u041e\u2019\u0448\u043e\u043b \u0436\u043e\u043b ", exercise_idx=3) == "e3:\u043e'\u0448\u043e\u043b \u0436\u043e\u043b"
