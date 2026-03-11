"""artists avatar url

Revision ID: b1d9f98a6c31
Revises: 03bad674b841
Create Date: 2026-02-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1d9f98a6c31"
down_revision: Union[str, None] = "03bad674b841"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("artists") as batch_op:
        batch_op.add_column(sa.Column("avatar_url", sa.String(length=512), nullable=True), if_not_exists=True)
        batch_op.drop_column("country", if_exists=True)


def downgrade() -> None:
    with op.batch_alter_table("artists") as batch_op:
        batch_op.add_column(sa.Column("country", sa.String(length=255), nullable=True), if_not_exists=True)
        batch_op.drop_column("avatar_url", if_exists=True)
