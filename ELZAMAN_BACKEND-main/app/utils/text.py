import unicodedata

APOSTROPHE_VARIANTS = {
    "\u2019",  # '
    "\u2018",  # '
    "\u02bc",  # ʼ
    "\u02bb",  # ʻ
    "\uff07",  # ＇
    "`",
    "\u00b4",  # ´
}


def normalize_kyrgyz_text(value: str) -> str:
    normalized = value.strip().lower()
    for symbol in APOSTROPHE_VARIANTS:
        normalized = normalized.replace(symbol, "'")
    normalized = "".join(
        ch for ch in normalized if not unicodedata.category(ch).startswith("P") or ch in {"'", "-"}
    )
    normalized = " ".join(normalized.split())
    return normalized
