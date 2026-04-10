from datetime import date, datetime, timezone

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.utils.datetime import utcnow


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("gender IN ('male', 'female')", name="users_gender_check"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nickname: Mapped[str | None] = mapped_column("display_name", String(255), index=True)
    locale: Mapped[str] = mapped_column(String(10), default="ru", nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    experience: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime)
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    gender: Mapped[str | None] = mapped_column(String(10))
    birth_date: Mapped[date | None] = mapped_column(Date)
    subscription_expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    timezone_changed_at: Mapped[datetime | None] = mapped_column(DateTime)
    streak_current: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    streak_best: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    streak_last_local_date: Mapped[date | None] = mapped_column(Date)
    delete_requested_at: Mapped[datetime | None] = mapped_column(DateTime)
    delete_effective_at: Mapped[datetime | None] = mapped_column(DateTime)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="user")
    subscriptions: Mapped[list["UserSubscription"]] = relationship()

    def is_premium(self) -> bool:
        if not self.subscription_expires_at:
            return False
        return self.subscription_expires_at > datetime.utcnow()

    def is_admin(self) -> bool:
        return self.role == "admin"


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    user: Mapped["User"] = relationship()


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    rotated_from: Mapped[str | None] = mapped_column(ForeignKey("refresh_sessions.jti", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime)
    user: Mapped["User"] = relationship()


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_code: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    purchased_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    price_cents: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str | None] = mapped_column(String(10))
    provider: Mapped[str | None] = mapped_column(String(50))
    external_id: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SubscriptionPurchaseRequest(Base):
    __tablename__ = "subscription_purchase_requests"
    __table_args__ = (
        Index("ix_subscription_purchase_requests_start_token", "start_token", unique=True),
        Index("ix_subscription_purchase_requests_user_status", "user_id", "status"),
        Index("ix_subscription_purchase_requests_chat_status", "telegram_chat_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    start_token: Mapped[str] = mapped_column(String(64), nullable=False)
    site_email: Mapped[str] = mapped_column(String(255), nullable=False)
    provided_email: Mapped[str | None] = mapped_column(String(255))
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger)
    telegram_user_id: Mapped[int | None] = mapped_column(BigInteger)
    telegram_username: Mapped[str | None] = mapped_column(String(255))
    telegram_first_name: Mapped[str | None] = mapped_column(String(255))
    telegram_language_code: Mapped[str | None] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="awaiting_start")
    receipt_file_id: Mapped[str | None] = mapped_column(String(255))
    receipt_file_unique_id: Mapped[str | None] = mapped_column(String(255))
    receipt_submitted_at: Mapped[datetime | None] = mapped_column(DateTime)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime)
    admin_notified_at: Mapped[datetime | None] = mapped_column(DateTime)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime)
    processed_by_telegram_user_id: Mapped[int | None] = mapped_column(BigInteger)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    user: Mapped["User"] = relationship()


class Artist(Base):
    __tablename__ = "artists"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    bio: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    songs: Mapped[list["Song"]] = relationship(back_populates="artist")


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    original_language: Mapped[str] = mapped_column(String(10), nullable=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    release_year: Mapped[int | None] = mapped_column(Integer)
    lyrics_text: Mapped[str | None] = mapped_column(Text)
    lyrics_text_ru: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    is_published: Mapped[bool] = mapped_column(default=False, nullable=False)
    artist: Mapped["Artist"] = relationship(back_populates="songs")
    audio_sources: Mapped[list["SongAudioSource"]] = relationship(back_populates="song")


class SongAudioSource(Base):
    __tablename__ = "song_audio_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    external_url: Mapped[str] = mapped_column(String(512), nullable=False)
    is_primary: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    song: Mapped["Song"] = relationship(back_populates="audio_sources")


class TrackFlashcardTemplate(Base):
    __tablename__ = "track_flashcard_templates"
    __table_args__ = (
        CheckConstraint("level_idx >= 1", name="track_flashcard_templates_level_idx_check"),
        UniqueConstraint("track_id", "level_idx", "order_idx", "kg_text", name="ux_track_flashcard_templates_track_level_order_kg"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), index=True, nullable=False)
    level_idx: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    kg_text: Mapped[str] = mapped_column(Text, nullable=False)
    ru_text: Mapped[str] = mapped_column(Text, nullable=False)
    order_idx: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )


class UserTrackProgress(Base):
    __tablename__ = "user_track_progress"
    __table_args__ = (
        CheckConstraint("status IN ('listened', 'learning', 'finished')", name="user_track_progress_status_check"),
        CheckConstraint("unlocked_level >= 1", name="user_track_progress_unlocked_level_check"),
        CheckConstraint("unlocked_game >= 1", name="user_track_progress_unlocked_game_check"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="learning")
    unlocked_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unlocked_game: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    started_learning_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_listened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )


class UserTrackFlashcardFolder(Base):
    __tablename__ = "user_track_flashcard_folder"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True)
    folder_id: Mapped[int] = mapped_column(ForeignKey("flashcard_folders.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )


class TrackGame2Pair(Base):
    __tablename__ = "track_game2_pairs"
    __table_args__ = (
        CheckConstraint("exercise_idx >= 2", name="track_game2_pairs_exercise_idx_check"),
        UniqueConstraint("track_id", "kg_text_norm", name="ux_track_game2_pairs_track_kg_norm"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), index=True, nullable=False)
    exercise_idx: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    kg_text: Mapped[str] = mapped_column(Text, nullable=False)
    kg_text_norm: Mapped[str] = mapped_column(String(500), nullable=False)
    ru_text: Mapped[str] = mapped_column(Text, nullable=False)
    order_idx: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )


class UserGameSession(Base):
    __tablename__ = "user_game_sessions"
    __table_args__ = (
        CheckConstraint("game_type IN ('pairs')", name="user_game_sessions_game_type_check"),
        CheckConstraint("level >= 1", name="user_game_sessions_level_check"),
        CheckConstraint("status IN ('in_progress', 'completed', 'abandoned')", name="user_game_sessions_status_check"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    track_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), index=True, nullable=False)
    game_type: Mapped[str] = mapped_column(String(20), nullable=False, default="pairs")
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_progress")
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserGameAnswer(Base):
    __tablename__ = "user_game_answers"

    session_id: Mapped[str] = mapped_column(ForeignKey("user_game_sessions.id", ondelete="CASCADE"), primary_key=True)
    pair_id: Mapped[int] = mapped_column(ForeignKey("track_game2_pairs.id", ondelete="CASCADE"), primary_key=True)
    chosen_option_id: Mapped[int] = mapped_column(ForeignKey("track_game2_pairs.id", ondelete="CASCADE"), nullable=False)
    is_correct: Mapped[bool] = mapped_column(nullable=False, default=False)
    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )


class UserUnlockedSong(Base):
    __tablename__ = "user_unlocked_songs"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    source: Mapped[str | None] = mapped_column(String(100))


class UserPlaylist(Base):
    __tablename__ = "user_playlists"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_public: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class UserPlaylistSong(Base):
    __tablename__ = "user_playlist_songs"

    playlist_id: Mapped[int] = mapped_column(ForeignKey("user_playlists.id", ondelete="CASCADE"), primary_key=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class FlashcardFolder(Base):
    __tablename__ = "flashcard_folders"
    __table_args__ = (
        UniqueConstraint("user_id", "title", name="ux_flashcard_folders_user_title"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(60), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )


class Flashcard(Base):
    __tablename__ = "flashcards"
    __table_args__ = (
        CheckConstraint("source_type IN ('curated', 'auto', 'folder')", name="flashcards_source_type_check"),
        CheckConstraint(
            "(source_type = 'folder' AND folder_id IS NOT NULL AND user_id IS NOT NULL) "
            "OR (source_type IN ('curated', 'auto') AND folder_id IS NULL)",
            name="flashcards_folder_shape_check",
        ),
        UniqueConstraint("folder_id", "prompt_text_norm", name="ux_flashcards_folder_prompt_norm"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_type: Mapped[str] = mapped_column(String(20), default="curated", nullable=False)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    answer_text: Mapped[str] = mapped_column(Text, nullable=False)
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("flashcard_folders.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    prompt_text_norm: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )


class UserFlashcardState(Base):
    __tablename__ = "user_flashcard_state"
    __table_args__ = (
        CheckConstraint("stage >= 1", name="user_flashcard_state_stage_check"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    flashcard_id: Mapped[int] = mapped_column(ForeignKey("flashcards.id", ondelete="CASCADE"), primary_key=True)
    stage: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)


class XpEvent(Base):
    __tablename__ = "xp_events"
    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="ux_xp_events_user_dedupe"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[str] = mapped_column(Text, nullable=False)
    dedupe_key: Mapped[str] = mapped_column(Text, nullable=False)
    xp_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )


class SongPageSession(Base):
    __tablename__ = "song_page_sessions"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False)


class LyricsLine(Base):
    __tablename__ = "lyrics_lines"
    __table_args__ = (
        UniqueConstraint("song_id", "line_no", name="ux_lyrics_lines_song_line"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), index=True, nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    text_raw: Mapped[str] = mapped_column(Text, nullable=False)
    tokens: Mapped[list["LyricsToken"]] = relationship(back_populates="line", cascade="all, delete-orphan")


class LyricsToken(Base):
    __tablename__ = "lyrics_tokens"
    __table_args__ = (
        UniqueConstraint("line_id", "idx", name="ux_lyrics_tokens_line_idx"),
        Index("ix_lyrics_tokens_normalized", "normalized"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("lyrics_lines.id", ondelete="CASCADE"), index=True, nullable=False)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    surface: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized: Mapped[str] = mapped_column(String(255), nullable=False)
    is_word: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    line: Mapped["LyricsLine"] = relationship(back_populates="tokens")


class SongTranslation(Base):
    __tablename__ = "song_translations"
    __table_args__ = (
        UniqueConstraint("song_id", "src_lang", "dst_lang", "src", name="ux_song_translations_song_lang_src"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), index=True, nullable=False)
    src_lang: Mapped[str] = mapped_column(String(10), nullable=False)
    dst_lang: Mapped[str] = mapped_column(String(10), nullable=False)
    src: Mapped[str] = mapped_column(String(255), nullable=False)
    dst_text: Mapped[str] = mapped_column(Text, nullable=False)


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    achievement_code: Mapped[str] = mapped_column(String(50), primary_key=True)
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("now()"),
        nullable=False,
    )
