"""add_lyrics_tokenization_tables

Revision ID: c7f3a1d29b45
Revises: a4e2c7f83d10
Create Date: 2026-03-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7f3a1d29b45"
down_revision: Union[str, None] = "a4e2c7f83d10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lyrics_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("song_id", sa.Integer(), sa.ForeignKey("songs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("line_no", sa.Integer(), nullable=False),
        sa.Column("text_raw", sa.Text(), nullable=False),
        sa.UniqueConstraint("song_id", "line_no", name="ux_lyrics_lines_song_line"),
        if_not_exists=True,
    )

    op.create_table(
        "lyrics_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("line_id", sa.Integer(), sa.ForeignKey("lyrics_lines.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("surface", sa.String(255), nullable=False),
        sa.Column("normalized", sa.String(255), nullable=False),
        sa.Column("is_word", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.UniqueConstraint("line_id", "idx", name="ux_lyrics_tokens_line_idx"),
        sa.Index("ix_lyrics_tokens_normalized", "normalized"),
        if_not_exists=True,
    )

    op.create_table(
        "song_translations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("song_id", sa.Integer(), sa.ForeignKey("songs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("src_lang", sa.String(10), nullable=False),
        sa.Column("dst_lang", sa.String(10), nullable=False),
        sa.Column("src", sa.String(255), nullable=False),
        sa.Column("dst_text", sa.Text(), nullable=False),
        sa.UniqueConstraint("song_id", "src_lang", "dst_lang", "src", name="ux_song_translations_song_lang_src"),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_table("song_translations", if_exists=True)
    op.drop_table("lyrics_tokens", if_exists=True)
    op.drop_table("lyrics_lines", if_exists=True)
