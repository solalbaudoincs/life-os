"""add conversations table and link chat_history

Revision ID: c5e0f3a4d7b9
Revises: b4d9e2f3c6a8
Create Date: 2026-03-17 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c5e0f3a4d7b9"
down_revision: Union[str, None] = "b4d9e2f3c6a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("title", sa.String(256), nullable=False, server_default="New conversation"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.add_column(
        "chat_history",
        sa.Column("conversation_id", sa.UUID(), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_index("idx_chat_history_conversation_id", "chat_history", ["conversation_id"])
    op.create_index("idx_conversations_updated_at", "conversations", [sa.text("updated_at DESC")])


def downgrade() -> None:
    op.drop_index("idx_chat_history_conversation_id", table_name="chat_history")
    op.drop_index("idx_conversations_updated_at", table_name="conversations")
    op.drop_column("chat_history", "conversation_id")
    op.drop_table("conversations")
