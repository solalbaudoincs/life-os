"""Pydantic response schemas for agent runs."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ToolCallResponse(BaseModel):
    id: uuid.UUID
    tool_name: str
    arguments_summary: str
    arguments_full: dict
    result_summary: str | None
    result_full: dict | None = None
    reasoning: str | None = None
    status: str
    round_number: int
    started_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class AgentRunSummary(BaseModel):
    """List view — no full tool_calls, just a count."""
    id: uuid.UUID
    module_id: uuid.UUID | None
    action_id: str
    action_name: str
    action_type: str
    status: str
    current_round: int
    max_rounds: int
    suggestions_created: int
    error: str | None
    started_at: datetime
    finished_at: datetime | None
    tool_call_count: int = 0

    model_config = {"from_attributes": True}


class AgentRunDetail(BaseModel):
    """Detail view — includes full tool_calls."""
    id: uuid.UUID
    module_id: uuid.UUID | None
    action_id: str
    action_name: str
    action_type: str
    status: str
    current_round: int
    max_rounds: int
    suggestions_created: int
    error: str | None
    started_at: datetime
    finished_at: datetime | None
    tool_calls: list[ToolCallResponse]

    model_config = {"from_attributes": True}


class AgentRunsListResponse(BaseModel):
    runs: list[AgentRunSummary]
    total: int
