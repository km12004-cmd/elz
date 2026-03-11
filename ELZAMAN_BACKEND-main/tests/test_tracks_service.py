from app.modules.tracks.service import _build_folder_title
from app.utils.text import normalize_kyrgyz_text


def test_normalize_kyrgyz_text_keeps_words_and_normalizes_apostrophes():
    value = "  \u00ab\u041e\u2019\u0448\u043e\u043b-\u0416\u043e\u043b!\u00bb  "
    assert normalize_kyrgyz_text(value) == "\u043e'\u0448\u043e\u043b-\u0436\u043e\u043b"


def test_build_folder_title_is_capped_to_max_length():
    title = _build_folder_title("A" * 200)
    assert len(title) <= 60
    assert title
