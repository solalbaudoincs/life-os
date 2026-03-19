"""ORM models for persisted agent runs and tool calls."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database import Base


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="SET NULL"), nullable=True)
    action_id = Column(String(128), nullable=False)
    action_name = Column(String(256), nullable=False)
    action_type = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False, default="running")
    current_round = Column(Integer, nullable=False, default=0)
    max_rounds = Column(Integer, nullable=False, default=10)
    suggestions_created = Column(Integer, nullable=False, default=0)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime(timezone=True), nullable=True)

    tool_calls = relationship("AgentToolCall", back_populates="run", cascade="all, delete-orphan", order_by="AgentToolCall.started_at")


class AgentToolCall(Base):
    __tablename__ = "agent_tool_calls"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False)
    tool_name = Column(String(128), nullable=False)
    arguments_summary = Column(String(512), nullable=False, default="")
    arguments_full = Column(JSONB, nullable=False, default=dict)
    result_summary = Column(String(512), nullable=True)
    result_full = Column(JSONB, nullable=True)
    reasoning = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="running")
    round_number = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime(timezone=True), nullable=True)

    run = relationship("AgentRun", back_populates="tool_calls")
