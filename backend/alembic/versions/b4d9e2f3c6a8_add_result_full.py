"""add result_full to agent_tool_calls

Revision ID: b4d9e2f3c6a8
Revises: a3c8f1d2b5e7
Create Date: 2026-03-17 16:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b4d9e2f3c6a8"
down_revision: Union[str, None] = "a3c8f1d2b5e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "agent_tool_calls",
        sa.Column("result_full", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("agent_tool_calls", "result_full")
