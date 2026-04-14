from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.dependencies import require_admin_user, require_current_user
from app.modules.subscriptions.service import ensure_song_study_access
from app.modules.lyrics.schemas import (
    BulkTranslationRequest,
    SongTranslationsResponse,
    TokenizedLyricsResponse,
    TokenizeResponse,
    TranslationCreateRequest,
    TranslationDictResponse,
    TranslationPatchRequest,
)
from app.modules.lyrics.service import (
    bulk_upsert_translations,
    create_translation,
    delete_translation,
    get_song_translations,
    get_tokenized_lyrics,
    list_song_dictionary,
    tokenize_song,
    update_translation,
)

router = APIRouter(prefix="/lyrics", tags=["Lyrics & Translations"])


@router.get("/songs/{song_id}", response_model=TokenizedLyricsResponse)
async def get_tokenized_lyrics_endpoint(
    song_id: int,
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_song_study_access(db, user, song_id)
    data = await get_tokenized_lyrics(db, song_id)
    return {"ok": True, **data}


@router.get("/songs/{song_id}/translations", response_model=SongTranslationsResponse)
async def get_song_translations_endpoint(
    song_id: int,
    lang: str = Query("ru"),
    user=Depends(require_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_song_study_access(db, user, song_id)
    data = await get_song_translations(db, song_id, lang)
    return {"ok": True, **data}


@router.post("/songs/{song_id}/tokenize", response_model=TokenizeResponse)
async def tokenize_song_endpoint(
    song_id: int,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    data = await tokenize_song(db, song_id)
    await db.commit()
    return {"ok": True, **data}


@router.get("/songs/{song_id}/dictionary", response_model=TranslationDictResponse)
async def list_dictionary_endpoint(
    song_id: int,
    src_lang: str = Query("kg"),
    dst_lang: str = Query("ru"),
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    data = await list_song_dictionary(db, song_id, src_lang=src_lang, dst_lang=dst_lang)
    return {"ok": True, **data}


@router.post("/songs/{song_id}/dictionary")
async def create_translation_endpoint(
    song_id: int,
    payload: TranslationCreateRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    data = await create_translation(
        db, song_id,
        src=payload.src,
        dst_text=payload.dst_text,
        src_lang=payload.src_lang,
        dst_lang=payload.dst_lang,
    )
    await db.commit()
    return {"ok": True, "translation": data}


@router.patch("/translations/{translation_id}")
async def update_translation_endpoint(
    translation_id: int,
    payload: TranslationPatchRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    data = await update_translation(
        db, translation_id,
        src=payload.src,
        dst_text=payload.dst_text,
    )
    await db.commit()
    return {"ok": True, "translation": data}


@router.delete("/translations/{translation_id}")
async def delete_translation_endpoint(
    translation_id: int,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_translation(db, translation_id)
    await db.commit()
    return {"ok": True}


@router.post("/songs/{song_id}/dictionary/bulk")
async def bulk_upsert_translations_endpoint(
    song_id: int,
    payload: BulkTranslationRequest,
    _: object = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    data = await bulk_upsert_translations(
        db, song_id,
        items=[item.model_dump() for item in payload.items],
        src_lang=payload.src_lang,
        dst_lang=payload.dst_lang,
    )
    await db.commit()
    return {"ok": True, **data}
