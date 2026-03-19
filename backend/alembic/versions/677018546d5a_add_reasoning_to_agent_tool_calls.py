"""add reasoning to agent_tool_calls

Revision ID: 677018546d5a
Revises: d7a8b2c1e4f5
Create Date: 2026-03-19 09:00:59.237651
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '677018546d5a'
down_revision: Union[str, None] = 'd7a8b2c1e4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('agent_tool_calls', sa.Column('reasoning', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('agent_tool_calls', 'reasoning')
