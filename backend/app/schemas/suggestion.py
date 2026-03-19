from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class SuggestionCreate(BaseModel):
    module_id: uuid.UUID | None = None
    action_id: str
    related_note_id: uuid.UUID | None = None
    type: str  # new_opportunity, follow_up, connection, alert, insight, enrichment
    title: str
    summary: str
    data: dict = {}
    confidence: float | None = None
    proposed_action: str  # create_note, update_note, link_notes, notify
    proposed_payload: dict = {}


class SuggestionResponse(BaseModel):
    id: uuid.UUID
    module_id: uuid.UUID | None
    action_id: str
    related_note_id: uuid.UUID | None
    type: str
    title: str
    summary: str
    data: dict
    confidence: float | None
    proposed_action: str
    proposed_payload: dict
    status: str
    snoozed_until: datetime | None
    resolved_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SuggestionEdit(BaseModel):
    proposed_payload: dict
