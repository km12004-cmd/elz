"""drop_songs_difficulty_level

Revision ID: a4e2c7f83d10
Revises: 3031be63f872
Create Date: 2026-02-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a4e2c7f83d10"
down_revision: Union[str, None] = "3031be63f872"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("songs", "difficulty_level", if_exists=True)


def downgrade() -> None:
    op.add_column(
        "songs",
        sa.Column("difficulty_level", sa.Integer(), nullable=False, server_default="1"),
        if_not_exists=True,
    )
