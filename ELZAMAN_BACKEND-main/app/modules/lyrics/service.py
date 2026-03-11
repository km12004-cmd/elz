import re
import unicodedata

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import LyricsLine, LyricsToken, Song, SongTranslation

_WORD_RE = re.compile(r"\S+")
_LETTER_RE = re.compile(r"[^\W\d_]", re.UNICODE)


def _normalize_token(surface: str) -> str:
    lowered = surface.lower()
    stripped = lowered.strip(".,!?;:\"'«»„""()[]{}—–-…·/\\")
    return stripped or lowered


def _is_word(surface: str) -> bool:
    return bool(_LETTER_RE.search(surface))


def _tokenize_line(text: str) -> list[dict]:
    tokens = []
    idx = 0
    pos = 0
    for match in _WORD_RE.finditer(text):
        start = match.start()
        if start > pos:
            space = text[pos:start]
            tokens.append({
                "idx": idx,
                "surface": space,
                "normalized": "",
                "is_word": False,
            })
            idx += 1
        word = match.group()
        tokens.append({
            "idx": idx,
            "surface": word,
            "normalized": _normalize_token(word),
            "is_word": _is_word(word),
        })
        idx += 1
        pos = match.end()
    if pos < len(text):
        tokens.append({
            "idx": idx,
            "surface": text[pos:],
            "normalized": "",
            "is_word": False,
        })
    return tokens


async def tokenize_song(db: AsyncSession, song_id: int) -> dict:
    song = await db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="song not found")

    lyrics = song.lyrics_text or ""
    if not lyrics.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="song has no lyrics")

    await db.execute(delete(LyricsLine).where(LyricsLine.song_id == song_id))
    await db.flush()

    raw_lines = lyrics.split("\n")
    total_tokens = 0

    for line_no, raw_line in enumerate(raw_lines):
        line_obj = LyricsLine(song_id=song_id, line_no=line_no, text_raw=raw_line)
        db.add(line_obj)
        await db.flush()

        token_dicts = _tokenize_line(raw_line)
        for td in token_dicts:
            token_obj = LyricsToken(
                line_id=line_obj.id,
                idx=td["idx"],
                surface=td["surface"],
                normalized=td["normalized"],
                is_word=td["is_word"],
            )
            db.add(token_obj)
            total_tokens += 1

    await db.flush()
    return {
        "song_id": song_id,
        "lines_count": len(raw_lines),
        "tokens_count": total_tokens,
    }


async def get_tokenized_lyrics(db: AsyncSession, song_id: int) -> dict:
    song = await db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="song not found")

    result = await db.execute(
        select(LyricsLine)
        .where(LyricsLine.song_id == song_id)
        .options(selectinload(LyricsLine.tokens))
        .order_by(LyricsLine.line_no)
    )
    lines = result.scalars().all()

    serialized_lines = []
    for line in lines:
        sorted_tokens = sorted(line.tokens, key=lambda t: t.idx)
        serialized_lines.append({
            "id": line.id,
            "line_no": line.line_no,
            "text_raw": line.text_raw,
            "tokens": [
                {
                    "id": t.id,
                    "idx": t.idx,
                    "surface": t.surface,
                    "normalized": t.normalized,
                    "is_word": t.is_word,
                }
                for t in sorted_tokens
            ],
        })

    return {"song_id": song_id, "lines": serialized_lines}


async def get_song_translations(
    db: AsyncSession, song_id: int, lang: str,
) -> dict:
    song = await db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="song not found")

    result = await db.execute(
        select(LyricsToken, SongTranslation.dst_text)
        .join(LyricsLine, LyricsToken.line_id == LyricsLine.id)
        .outerjoin(
            SongTranslation,
            (SongTranslation.song_id == song_id)
            & (SongTranslation.src_lang == "kg")
            & (SongTranslation.dst_lang == lang)
            & (SongTranslation.src == LyricsToken.normalized),
        )
        .where(LyricsLine.song_id == song_id, LyricsToken.is_word.is_(True))
        .order_by(LyricsLine.line_no, LyricsToken.idx)
    )
    rows = result.all()

    translations = []
    for token, dst_text in rows:
        translations.append({
            "token_id": token.id,
            "surface": token.surface,
            "normalized": token.normalized,
            "translation": dst_text,
        })

    return {"song_id": song_id, "lang": lang, "translations": translations}


async def list_song_dictionary(
    db: AsyncSession, song_id: int, *, src_lang: str = "kg", dst_lang: str = "ru",
) -> dict:
    song = await db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="song not found")

    result = await db.execute(
        select(SongTranslation)
        .where(
            SongTranslation.song_id == song_id,
            SongTranslation.src_lang == src_lang,
            SongTranslation.dst_lang == dst_lang,
        )
        .order_by(SongTranslation.src)
    )
    items = result.scalars().all()

    return {
        "song_id": song_id,
        "items": [
            {
                "id": t.id,
                "src": t.src,
                "dst_text": t.dst_text,
                "src_lang": t.src_lang,
                "dst_lang": t.dst_lang,
            }
            for t in items
        ],
        "total": len(items),
    }


async def create_translation(
    db: AsyncSession,
    song_id: int,
    *,
    src: str,
    dst_text: str,
    src_lang: str = "kg",
    dst_lang: str = "ru",
) -> dict:
    song = await db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="song not found")

    normalized_src = _normalize_token(src)
    if not normalized_src:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="src cannot be empty")

    existing = await db.execute(
        select(SongTranslation).where(
            SongTranslation.song_id == song_id,
            SongTranslation.src_lang == src_lang,
            SongTranslation.dst_lang == dst_lang,
            SongTranslation.src == normalized_src,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="translation already exists")

    obj = SongTranslation(
        song_id=song_id,
        src_lang=src_lang,
        dst_lang=dst_lang,
        src=normalized_src,
        dst_text=dst_text.strip(),
    )
    db.add(obj)
    await db.flush()
    return {"id": obj.id, "src": obj.src, "dst_text": obj.dst_text, "src_lang": obj.src_lang, "dst_lang": obj.dst_lang}


async def update_translation(
    db: AsyncSession, translation_id: int, *, src: str | None = None, dst_text: str | None = None,
) -> dict:
    obj = await db.get(SongTranslation, translation_id)
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="translation not found")

    if src is not None:
        normalized = _normalize_token(src)
        if not normalized:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="src cannot be empty")
        obj.src = normalized
    if dst_text is not None:
        obj.dst_text = dst_text.strip()

    await db.flush()
    return {"id": obj.id, "src": obj.src, "dst_text": obj.dst_text, "src_lang": obj.src_lang, "dst_lang": obj.dst_lang}


async def delete_translation(db: AsyncSession, translation_id: int) -> None:
    obj = await db.get(SongTranslation, translation_id)
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="translation not found")
    await db.delete(obj)
    await db.flush()


async def bulk_upsert_translations(
    db: AsyncSession,
    song_id: int,
    *,
    items: list[dict],
    src_lang: str = "kg",
    dst_lang: str = "ru",
) -> dict:
    song = await db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="song not found")

    created = 0
    updated = 0

    for item in items:
        normalized_src = _normalize_token(item["src"])
        if not normalized_src:
            continue

        result = await db.execute(
            select(SongTranslation).where(
                SongTranslation.song_id == song_id,
                SongTranslation.src_lang == src_lang,
                SongTranslation.dst_lang == dst_lang,
                SongTranslation.src == normalized_src,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.dst_text = item["dst_text"].strip()
            updated += 1
        else:
            db.add(SongTranslation(
                song_id=song_id,
                src_lang=src_lang,
                dst_lang=dst_lang,
                src=normalized_src,
                dst_text=item["dst_text"].strip(),
            ))
            created += 1

    await db.flush()
    return {"created": created, "updated": updated}
