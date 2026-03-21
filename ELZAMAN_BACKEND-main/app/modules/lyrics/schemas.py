from pydantic import BaseModel


class TokenItem(BaseModel):
    id: int
    idx: int
    surface: str
    normalized: str
    is_word: bool


class LineItem(BaseModel):
    id: int
    line_no: int
    text_raw: str
    tokens: list[TokenItem]


class TokenizedLyricsResponse(BaseModel):
    ok: bool = True
    song_id: int
    lines: list[LineItem]


class TranslationEntry(BaseModel):
    token_id: int
    surface: str
    normalized: str
    translation: str | None = None


class SongTranslationsResponse(BaseModel):
    ok: bool = True
    song_id: int
    lang: str
    translations: list[TranslationEntry]


class TranslationDictItem(BaseModel):
    id: int
    src: str
    dst_text: str
    src_lang: str
    dst_lang: str


class TranslationDictResponse(BaseModel):
    ok: bool = True
    song_id: int
    items: list[TranslationDictItem]
    total: int


class TranslationCreateRequest(BaseModel):
    src: str
    dst_text: str
    src_lang: str = "kg"
    dst_lang: str = "ru"


class TranslationPatchRequest(BaseModel):
    src: str | None = None
    dst_text: str | None = None


class BulkTranslationItem(BaseModel):
    src: str
    dst_text: str


class BulkTranslationRequest(BaseModel):
    src_lang: str = "kg"
    dst_lang: str = "ru"
    items: list[BulkTranslationItem]


class TokenizeResponse(BaseModel):
    ok: bool = True
    song_id: int
    lines_count: int
    tokens_count: int
