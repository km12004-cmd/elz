from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app.db.base import Base
from app.db.session import engine
from app.services.storage import ensure_media_dirs


async def _apply_postgres_users_backfill(conn) -> None:
    if conn.dialect.name != "postgresql":
        return

    await conn.execute(
        text(
            """
            ALTER TABLE public.users
              ADD COLUMN IF NOT EXISTS timezone character varying(64) NOT NULL DEFAULT 'UTC',
              ADD COLUMN IF NOT EXISTS timezone_changed_at timestamp without time zone,
              ADD COLUMN IF NOT EXISTS streak_current integer NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS streak_best integer NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS streak_last_local_date date,
              ADD COLUMN IF NOT EXISTS delete_requested_at timestamp without time zone,
              ADD COLUMN IF NOT EXISTS delete_effective_at timestamp without time zone,
              ADD COLUMN IF NOT EXISTS deleted_at timestamp without time zone
            """
        )
    )


async def _apply_postgres_flashcards_folders_backfill(conn) -> None:
    if conn.dialect.name != "postgresql":
        return

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS public.flashcard_folders (
              id bigserial PRIMARY KEY,
              user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
              title character varying(60) NOT NULL,
              created_at timestamp with time zone NOT NULL DEFAULT now(),
              updated_at timestamp with time zone NOT NULL DEFAULT now(),
              CONSTRAINT ux_flashcard_folders_user_title UNIQUE (user_id, title)
            )
            """
        )
    )
    await conn.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_flashcard_folders_user_id
              ON public.flashcard_folders (user_id)
            """
        )
    )
    await conn.execute(
        text(
            """
            ALTER TABLE public.flashcard_folders
              ALTER COLUMN created_at SET DEFAULT now(),
              ALTER COLUMN updated_at SET DEFAULT now()
            """
        )
    )
    await conn.execute(
        text(
            """
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'flashcards'
                  AND column_name = 'created_at'
                  AND data_type = 'timestamp without time zone'
              ) THEN
                ALTER TABLE public.flashcards
                  ALTER COLUMN created_at TYPE timestamp with time zone
                  USING created_at AT TIME ZONE 'UTC';
              END IF;
            END $$;
            """
        )
    )
    await conn.execute(
        text(
            """
            ALTER TABLE public.flashcards
              ADD COLUMN IF NOT EXISTS folder_id bigint,
              ADD COLUMN IF NOT EXISTS user_id integer,
              ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now()
            """
        )
    )
    await conn.execute(
        text(
            """
            ALTER TABLE public.flashcards
              ALTER COLUMN created_at SET DEFAULT now(),
              ALTER COLUMN updated_at SET DEFAULT now()
            """
        )
    )
    await conn.execute(
        text(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conrelid = 'public.flashcards'::regclass
                  AND conname = 'flashcards_folder_id_fkey'
              ) THEN
                ALTER TABLE public.flashcards
                  ADD CONSTRAINT flashcards_folder_id_fkey
                  FOREIGN KEY (folder_id) REFERENCES public.flashcard_folders(id) ON DELETE CASCADE;
              END IF;
            END $$;
            """
        )
    )
    await conn.execute(
        text(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conrelid = 'public.flashcards'::regclass
                  AND conname = 'flashcards_user_id_fkey'
              ) THEN
                ALTER TABLE public.flashcards
                  ADD CONSTRAINT flashcards_user_id_fkey
                  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
              END IF;
            END $$;
            """
        )
    )
    await conn.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_flashcards_folder_id
              ON public.flashcards (folder_id)
            """
        )
    )
    await conn.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_flashcards_user_id
              ON public.flashcards (user_id)
            """
        )
    )
    await conn.execute(
        text(
            """
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conrelid = 'public.flashcards'::regclass
                  AND conname = 'flashcards_source_type_check'
              ) THEN
                ALTER TABLE public.flashcards
                  DROP CONSTRAINT flashcards_source_type_check;
              END IF;
            END $$;
            """
        )
    )
    await conn.execute(
        text(
            """
            ALTER TABLE public.flashcards
              ADD CONSTRAINT flashcards_source_type_check
              CHECK (source_type IN ('curated', 'auto', 'folder'))
            """
        )
    )
    await conn.execute(
        text(
            """
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conrelid = 'public.flashcards'::regclass
                  AND conname = 'flashcards_folder_shape_check'
              ) THEN
                ALTER TABLE public.flashcards
                  DROP CONSTRAINT flashcards_folder_shape_check;
              END IF;
            END $$;
            """
        )
    )
    await conn.execute(
        text(
            """
            ALTER TABLE public.flashcards
              ADD CONSTRAINT flashcards_folder_shape_check
              CHECK (
                (source_type = 'folder' AND folder_id IS NOT NULL AND user_id IS NOT NULL)
                OR
                (source_type IN ('curated', 'auto') AND folder_id IS NULL)
              )
            """
        )
    )



async def _apply_track_learning_backfill(conn) -> None:
    if conn.dialect.name == "postgresql":
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public.track_flashcard_templates (
                  id bigserial PRIMARY KEY,
                  track_id integer NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
                  level_idx integer NOT NULL DEFAULT 1,
                  kg_text text NOT NULL,
                  ru_text text NOT NULL,
                  order_idx integer NOT NULL DEFAULT 1,
                  created_at timestamp with time zone NOT NULL DEFAULT now(),
                  CONSTRAINT track_flashcard_templates_level_idx_check CHECK (level_idx >= 1),
                  CONSTRAINT ux_track_flashcard_templates_track_level_order_kg
                    UNIQUE (track_id, level_idx, order_idx, kg_text)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE public.track_flashcard_templates
                  ADD COLUMN IF NOT EXISTS level_idx integer NOT NULL DEFAULT 1
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'public.track_flashcard_templates'::regclass
                      AND conname = 'ux_track_flashcard_templates_track_order_kg'
                  ) THEN
                    ALTER TABLE public.track_flashcard_templates
                      DROP CONSTRAINT ux_track_flashcard_templates_track_order_kg;
                  END IF;
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'public.track_flashcard_templates'::regclass
                      AND conname = 'track_flashcard_templates_level_idx_check'
                  ) THEN
                    ALTER TABLE public.track_flashcard_templates
                      ADD CONSTRAINT track_flashcard_templates_level_idx_check CHECK (level_idx >= 1);
                  END IF;
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'public.track_flashcard_templates'::regclass
                      AND conname = 'ux_track_flashcard_templates_track_level_order_kg'
                  ) THEN
                    ALTER TABLE public.track_flashcard_templates
                      ADD CONSTRAINT ux_track_flashcard_templates_track_level_order_kg
                      UNIQUE (track_id, level_idx, order_idx, kg_text);
                  END IF;
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_track_flashcard_templates_track_id
                  ON public.track_flashcard_templates (track_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public.user_track_progress (
                  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                  track_id integer NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
                  status character varying(20) NOT NULL DEFAULT 'learning',
                  unlocked_level integer NOT NULL DEFAULT 1,
                  unlocked_game integer NOT NULL DEFAULT 1,
                  started_learning_at timestamp with time zone,
                  last_listened_at timestamp with time zone,
                  created_at timestamp with time zone NOT NULL DEFAULT now(),
                  updated_at timestamp with time zone NOT NULL DEFAULT now(),
                  CONSTRAINT user_track_progress_pk PRIMARY KEY (user_id, track_id),
                  CONSTRAINT user_track_progress_status_check CHECK (status IN ('listened', 'learning', 'finished')),
                  CONSTRAINT user_track_progress_unlocked_level_check CHECK (unlocked_level >= 1),
                  CONSTRAINT user_track_progress_unlocked_game_check CHECK (unlocked_game >= 1)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE public.user_track_progress
                  ADD COLUMN IF NOT EXISTS unlocked_game integer NOT NULL DEFAULT 1
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'public.user_track_progress'::regclass
                      AND conname = 'user_track_progress_unlocked_game_check'
                  ) THEN
                    ALTER TABLE public.user_track_progress
                      ADD CONSTRAINT user_track_progress_unlocked_game_check CHECK (unlocked_game >= 1);
                  END IF;
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public.user_track_flashcard_folder (
                  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                  track_id integer NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
                  folder_id bigint NOT NULL REFERENCES public.flashcard_folders(id) ON DELETE CASCADE,
                  created_at timestamp with time zone NOT NULL DEFAULT now(),
                  CONSTRAINT user_track_flashcard_folder_pk PRIMARY KEY (user_id, track_id)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_user_track_flashcard_folder_folder_id
                  ON public.user_track_flashcard_folder (folder_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE public.flashcards
                  ADD COLUMN IF NOT EXISTS prompt_text_norm character varying(500)
                """
            )
        )
        await conn.execute(
            text(
                """
                UPDATE public.flashcards
                SET prompt_text_norm = lower(btrim(prompt_text))
                WHERE source_type = 'folder'
                  AND prompt_text_norm IS NULL
                """
            )
        )

        duplicates = await conn.execute(
            text(
                """
                SELECT COUNT(*)::int
                FROM (
                  SELECT folder_id, prompt_text_norm, COUNT(*)
                  FROM public.flashcards
                  WHERE source_type = 'folder'
                    AND prompt_text_norm IS NOT NULL
                  GROUP BY folder_id, prompt_text_norm
                  HAVING COUNT(*) > 1
                ) dup
                """
            )
        )
        duplicates_count = int(duplicates.scalar_one() or 0)
        if duplicates_count == 0:
            await conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS ux_flashcards_folder_prompt_norm
                      ON public.flashcards (folder_id, prompt_text_norm)
                    """
                )
            )
        return

    if conn.dialect.name == "sqlite":
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS track_flashcard_templates (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  track_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                  level_idx INTEGER NOT NULL DEFAULT 1,
                  kg_text TEXT NOT NULL,
                  ru_text TEXT NOT NULL,
                  order_idx INTEGER NOT NULL DEFAULT 1,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  CONSTRAINT track_flashcard_templates_level_idx_check CHECK (level_idx >= 1),
                  CONSTRAINT ux_track_flashcard_templates_track_level_order_kg
                    UNIQUE (track_id, level_idx, order_idx, kg_text)
                )
                """
            )
        )
        result = await conn.execute(text("PRAGMA table_info(track_flashcard_templates)"))
        columns = {str(row[1]) for row in result.fetchall()}
        if "level_idx" not in columns:
            await conn.execute(text("ALTER TABLE track_flashcard_templates ADD COLUMN level_idx INTEGER NOT NULL DEFAULT 1"))
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_track_flashcard_templates_track_id
                  ON track_flashcard_templates (track_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_track_progress (
                  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  track_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                  status TEXT NOT NULL DEFAULT 'learning',
                  unlocked_level INTEGER NOT NULL DEFAULT 1,
                  unlocked_game INTEGER NOT NULL DEFAULT 1,
                  started_learning_at DATETIME,
                  last_listened_at DATETIME,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (user_id, track_id),
                  CONSTRAINT user_track_progress_status_check CHECK (status IN ('listened', 'learning', 'finished')),
                  CONSTRAINT user_track_progress_unlocked_level_check CHECK (unlocked_level >= 1),
                  CONSTRAINT user_track_progress_unlocked_game_check CHECK (unlocked_game >= 1)
                )
                """
            )
        )
        result = await conn.execute(text("PRAGMA table_info(user_track_progress)"))
        progress_columns = {str(row[1]) for row in result.fetchall()}
        if "unlocked_game" not in progress_columns:
            await conn.execute(text("ALTER TABLE user_track_progress ADD COLUMN unlocked_game INTEGER NOT NULL DEFAULT 1"))
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_track_flashcard_folder (
                  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  track_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                  folder_id INTEGER NOT NULL REFERENCES flashcard_folders(id) ON DELETE CASCADE,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (user_id, track_id)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_user_track_flashcard_folder_folder_id
                  ON user_track_flashcard_folder (folder_id)
                """
            )
        )

        result = await conn.execute(text("PRAGMA table_info(flashcards)"))
        columns = {str(row[1]) for row in result.fetchall()}
        if "prompt_text_norm" not in columns:
            await conn.execute(text("ALTER TABLE flashcards ADD COLUMN prompt_text_norm TEXT"))
        await conn.execute(
            text(
                """
                UPDATE flashcards
                SET prompt_text_norm = lower(trim(prompt_text))
                WHERE source_type = 'folder'
                  AND prompt_text_norm IS NULL
                """
            )
        )
        duplicates = await conn.execute(
            text(
                """
                SELECT COUNT(*)
                FROM (
                  SELECT folder_id, prompt_text_norm, COUNT(*)
                  FROM flashcards
                  WHERE source_type = 'folder'
                    AND prompt_text_norm IS NOT NULL
                  GROUP BY folder_id, prompt_text_norm
                  HAVING COUNT(*) > 1
                ) dup
                """
            )
        )
        duplicates_count = int(duplicates.scalar_one() or 0)
        if duplicates_count == 0:
            await conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS ux_flashcards_folder_prompt_norm
                      ON flashcards (folder_id, prompt_text_norm)
                    """
                )
            )
        return


async def _apply_game2_pairs_backfill(conn) -> None:
    if conn.dialect.name == "postgresql":
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public.track_game2_pairs (
                  id bigserial PRIMARY KEY,
                  track_id integer NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
                  exercise_idx integer NOT NULL DEFAULT 2,
                  kg_text text NOT NULL,
                  kg_text_norm character varying(500) NOT NULL,
                  ru_text text NOT NULL,
                  order_idx integer NOT NULL DEFAULT 1,
                  created_at timestamp with time zone NOT NULL DEFAULT now(),
                  CONSTRAINT track_game2_pairs_exercise_idx_check CHECK (exercise_idx >= 2),
                  CONSTRAINT ux_track_game2_pairs_track_kg_norm UNIQUE (track_id, kg_text_norm)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE public.track_game2_pairs
                  ADD COLUMN IF NOT EXISTS exercise_idx integer NOT NULL DEFAULT 2
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'public.track_game2_pairs'::regclass
                      AND conname = 'track_game2_pairs_exercise_idx_check'
                  ) THEN
                    ALTER TABLE public.track_game2_pairs
                      ADD CONSTRAINT track_game2_pairs_exercise_idx_check CHECK (exercise_idx >= 2);
                  END IF;
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                UPDATE public.track_game2_pairs
                SET kg_text_norm = 'e' || exercise_idx::text || ':' || kg_text_norm
                WHERE kg_text_norm IS NOT NULL
                  AND kg_text_norm NOT LIKE 'e%:%'
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_track_game2_pairs_track_id
                  ON public.track_game2_pairs (track_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_track_game2_pairs_track_exercise
                  ON public.track_game2_pairs (track_id, exercise_idx)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public.user_game_sessions (
                  id character varying(36) PRIMARY KEY,
                  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                  track_id integer NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
                  game_type character varying(20) NOT NULL DEFAULT 'pairs',
                  level integer NOT NULL DEFAULT 2,
                  status character varying(20) NOT NULL DEFAULT 'in_progress',
                  seed integer NOT NULL,
                  started_at timestamp with time zone NOT NULL DEFAULT now(),
                  finished_at timestamp with time zone,
                  CONSTRAINT user_game_sessions_game_type_check CHECK (game_type IN ('pairs')),
                  CONSTRAINT user_game_sessions_level_check CHECK (level >= 1),
                  CONSTRAINT user_game_sessions_status_check CHECK (status IN ('in_progress', 'completed', 'abandoned'))
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_user_game_sessions_user_id
                  ON public.user_game_sessions (user_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_user_game_sessions_track_id
                  ON public.user_game_sessions (track_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public.user_game_answers (
                  session_id character varying(36) NOT NULL REFERENCES public.user_game_sessions(id) ON DELETE CASCADE,
                  pair_id bigint NOT NULL REFERENCES public.track_game2_pairs(id) ON DELETE CASCADE,
                  chosen_option_id bigint NOT NULL REFERENCES public.track_game2_pairs(id) ON DELETE CASCADE,
                  is_correct boolean NOT NULL DEFAULT false,
                  answered_at timestamp with time zone NOT NULL DEFAULT now(),
                  CONSTRAINT user_game_answers_pk PRIMARY KEY (session_id, pair_id)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_user_game_answers_pair_id
                  ON public.user_game_answers (pair_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_user_game_answers_chosen_option_id
                  ON public.user_game_answers (chosen_option_id)
                """
            )
        )
        return

    if conn.dialect.name == "sqlite":
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS track_game2_pairs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  track_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                  exercise_idx INTEGER NOT NULL DEFAULT 2,
                  kg_text TEXT NOT NULL,
                  kg_text_norm TEXT NOT NULL,
                  ru_text TEXT NOT NULL,
                  order_idx INTEGER NOT NULL DEFAULT 1,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  CONSTRAINT track_game2_pairs_exercise_idx_check CHECK (exercise_idx >= 2),
                  CONSTRAINT ux_track_game2_pairs_track_kg_norm UNIQUE (track_id, kg_text_norm)
                )
                """
            )
        )
        result = await conn.execute(text("PRAGMA table_info(track_game2_pairs)"))
        columns = {str(row[1]) for row in result.fetchall()}
        if "exercise_idx" not in columns:
            await conn.execute(text("ALTER TABLE track_game2_pairs ADD COLUMN exercise_idx INTEGER NOT NULL DEFAULT 2"))
        await conn.execute(
            text(
                """
                UPDATE track_game2_pairs
                SET kg_text_norm = 'e' || CAST(exercise_idx AS TEXT) || ':' || kg_text_norm
                WHERE kg_text_norm IS NOT NULL
                  AND kg_text_norm NOT LIKE 'e%:%'
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_track_game2_pairs_track_id
                  ON track_game2_pairs (track_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_track_game2_pairs_track_exercise
                  ON track_game2_pairs (track_id, exercise_idx)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_game_sessions (
                  id TEXT PRIMARY KEY,
                  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  track_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                  game_type TEXT NOT NULL DEFAULT 'pairs',
                  level INTEGER NOT NULL DEFAULT 2,
                  status TEXT NOT NULL DEFAULT 'in_progress',
                  seed INTEGER NOT NULL,
                  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  finished_at DATETIME,
                  CONSTRAINT user_game_sessions_game_type_check CHECK (game_type IN ('pairs')),
                  CONSTRAINT user_game_sessions_level_check CHECK (level >= 1),
                  CONSTRAINT user_game_sessions_status_check CHECK (status IN ('in_progress', 'completed', 'abandoned'))
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_user_game_sessions_user_id
                  ON user_game_sessions (user_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_user_game_sessions_track_id
                  ON user_game_sessions (track_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_game_answers (
                  session_id TEXT NOT NULL REFERENCES user_game_sessions(id) ON DELETE CASCADE,
                  pair_id INTEGER NOT NULL REFERENCES track_game2_pairs(id) ON DELETE CASCADE,
                  chosen_option_id INTEGER NOT NULL REFERENCES track_game2_pairs(id) ON DELETE CASCADE,
                  is_correct INTEGER NOT NULL DEFAULT 0,
                  answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (session_id, pair_id)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_user_game_answers_pair_id
                  ON user_game_answers (pair_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_user_game_answers_chosen_option_id
                  ON user_game_answers (chosen_option_id)
                """
            )
        )
        return


async def _apply_xp_backfill(conn) -> None:
    if conn.dialect.name == "postgresql":
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public.xp_events (
                  id bigserial PRIMARY KEY,
                  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                  event_type text NOT NULL,
                  source_id text NOT NULL,
                  dedupe_key text NOT NULL,
                  xp_delta integer NOT NULL,
                  created_at timestamp with time zone NOT NULL DEFAULT now(),
                  CONSTRAINT ux_xp_events_user_dedupe UNIQUE (user_id, dedupe_key)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_xp_events_user_id
                  ON public.xp_events (user_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public.song_page_sessions (
                  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                  song_id integer NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
                  opened_at timestamp with time zone NOT NULL,
                  session_id character varying(36) NOT NULL,
                  CONSTRAINT song_page_sessions_pk PRIMARY KEY (user_id, song_id)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE public.users
                  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
                  ADD COLUMN IF NOT EXISTS experience integer NOT NULL DEFAULT 0
                """
            )
        )
        return

    if conn.dialect.name == "sqlite":
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS xp_events (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  event_type TEXT NOT NULL,
                  source_id TEXT NOT NULL,
                  dedupe_key TEXT NOT NULL,
                  xp_delta INTEGER NOT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  CONSTRAINT ux_xp_events_user_dedupe UNIQUE (user_id, dedupe_key)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_xp_events_user_id
                  ON xp_events (user_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS song_page_sessions (
                  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                  opened_at DATETIME NOT NULL,
                  session_id TEXT NOT NULL,
                  PRIMARY KEY (user_id, song_id)
                )
                """
            )
        )
        result = await conn.execute(text("PRAGMA table_info(users)"))
        user_cols = {str(row[1]) for row in result.fetchall()}
        if "level" not in user_cols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN level INTEGER NOT NULL DEFAULT 1"))
        if "experience" not in user_cols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN experience INTEGER NOT NULL DEFAULT 0"))
        return


async def _apply_songs_ru_lyrics_backfill(conn) -> None:
    if conn.dialect.name == "postgresql":
        await conn.execute(
            text(
                """
                ALTER TABLE public.songs
                  ADD COLUMN IF NOT EXISTS lyrics_text_ru text
                """
            )
        )
        return

    if conn.dialect.name == "sqlite":
        result = await conn.execute(text("PRAGMA table_info(songs)"))
        columns = {str(row[1]) for row in result.fetchall()}
        if "lyrics_text_ru" not in columns:
            await conn.execute(text("ALTER TABLE songs ADD COLUMN lyrics_text_ru TEXT"))
        return


async def _apply_admin_role_backfill(conn) -> None:
    if conn.dialect.name == "postgresql":
        await conn.execute(
            text(
                """
                ALTER TABLE public.users
                  ADD COLUMN IF NOT EXISTS role character varying(50) NOT NULL DEFAULT 'user'
                """
            )
        )
        return

    if conn.dialect.name == "sqlite":
        result = await conn.execute(text("PRAGMA table_info(users)"))
        columns = {str(row[1]) for row in result.fetchall()}
        if "role" not in columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user'"))
        return


async def _apply_lyrics_tables_backfill(conn) -> None:
    if conn.dialect.name == "postgresql":
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS lyrics_lines (
                    id SERIAL PRIMARY KEY,
                    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                    line_no INTEGER NOT NULL,
                    text_raw TEXT NOT NULL,
                    UNIQUE (song_id, line_no)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS lyrics_tokens (
                    id SERIAL PRIMARY KEY,
                    line_id INTEGER NOT NULL REFERENCES lyrics_lines(id) ON DELETE CASCADE,
                    idx INTEGER NOT NULL,
                    surface VARCHAR(255) NOT NULL,
                    normalized VARCHAR(255) NOT NULL,
                    is_word BOOLEAN NOT NULL DEFAULT false,
                    UNIQUE (line_id, idx)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_lyrics_tokens_normalized ON lyrics_tokens(normalized)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS song_translations (
                    id SERIAL PRIMARY KEY,
                    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                    src_lang VARCHAR(10) NOT NULL,
                    dst_lang VARCHAR(10) NOT NULL,
                    src VARCHAR(255) NOT NULL,
                    dst_text TEXT NOT NULL,
                    UNIQUE (song_id, src_lang, dst_lang, src)
                )
                """
            )
        )
        return

    if conn.dialect.name == "sqlite":
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS lyrics_lines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                    line_no INTEGER NOT NULL,
                    text_raw TEXT NOT NULL,
                    UNIQUE (song_id, line_no)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS lyrics_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    line_id INTEGER NOT NULL REFERENCES lyrics_lines(id) ON DELETE CASCADE,
                    idx INTEGER NOT NULL,
                    surface VARCHAR(255) NOT NULL,
                    normalized VARCHAR(255) NOT NULL,
                    is_word BOOLEAN NOT NULL DEFAULT 0,
                    UNIQUE (line_id, idx)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_lyrics_tokens_normalized ON lyrics_tokens(normalized)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS song_translations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                    src_lang VARCHAR(10) NOT NULL,
                    dst_lang VARCHAR(10) NOT NULL,
                    src VARCHAR(255) NOT NULL,
                    dst_text TEXT NOT NULL,
                    UNIQUE (song_id, src_lang, dst_lang, src)
                )
                """
            )
        )
        return


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        ensure_media_dirs()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await _apply_postgres_users_backfill(conn)
            await _apply_postgres_flashcards_folders_backfill(conn)
            await _apply_track_learning_backfill(conn)
            await _apply_game2_pairs_backfill(conn)
            await _apply_xp_backfill(conn)
            await _apply_admin_role_backfill(conn)
            await _apply_songs_ru_lyrics_backfill(conn)
            await _apply_lyrics_tables_backfill(conn)
    except Exception as exc:  # pragma: no cover - startup resilience
        print("DB is not available, startup skipped:", exc)
    yield
