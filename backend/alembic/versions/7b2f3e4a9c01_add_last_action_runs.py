"""add last_action_runs to modules

Revision ID: 7b2f3e4a9c01
Revises: 4a59e3b81428
Create Date: 2026-03-17 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "7b2f3e4a9c01"
down_revision: Union[str, None] = "4a59e3b81428"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "modules",
        sa.Column(
            "last_action_runs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("modules", "last_action_runs")
