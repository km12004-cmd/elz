"""add_user_role

Revision ID: 3031be63f872
Revises: b1d9f98a6c31
Create Date: 2026-02-25 14:22:30.926294

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3031be63f872"
down_revision: Union[str, None] = "b1d9f98a6c31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(50), nullable=False, server_default="user"),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_column("users", "role", if_exists=True)
