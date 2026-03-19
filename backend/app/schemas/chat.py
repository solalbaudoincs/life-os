from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []
    conversation_id: str | None = None


class ToolCallInfo(BaseModel):
    name: str
    arguments: dict
    result: dict | str | list


class PendingConfirmation(BaseModel):
    tool_name: str
    arguments: dict
    title: str
    description: str
    details: dict = {}
    confirm_label: str = "Confirm"
    destructive: bool = False


class ChatResponse(BaseModel):
    response: str
    tool_calls: list[ToolCallInfo] = []
    conversation_id: str
    pending_confirmation: PendingConfirmation | None = None
    messages_snapshot: list[dict] | None = None


class ConfirmActionRequest(BaseModel):
    conversation_id: str
    pending_tool: dict
    messages_snapshot: list[dict]


class CancelActionRequest(BaseModel):
    conversation_id: str
    pending_tool: dict
    messages_snapshot: list[dict]


class ConversationSummary(BaseModel):
    id: uuid.UUID
    title: str
    summary: str | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    model_config = {"from_attributes": True}


class ConversationDetail(BaseModel):
    id: uuid.UUID
    title: str
    messages: list[ConversationMessage] = []

    model_config = {"from_attributes": True}


class ConversationMessage(BaseModel):
    role: str
    content: str
    tool_calls: list[ToolCallInfo] | None = None
    created_at: datetime


class ConversationUpdate(BaseModel):
    title: str


class AgentTextResponse(BaseModel):
    """Structured output schema for the agent's text responses.

    Passed as response_format to Mistral. When the model calls tools,
    response_format is ignored. When it responds with text, the output
    is valid JSON matching this schema.
    """

    text: str
    suggested_followups: list[str] = []
