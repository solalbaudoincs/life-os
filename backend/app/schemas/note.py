from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class NoteCreate(BaseModel):
    module_id: uuid.UUID
    title: str
    content_md: str = ""
    metadata: dict = {}


class NoteUpdate(BaseModel):
    title: str | None = None
    content_md: str | None = None
    metadata: dict | None = None
    archived: bool | None = None


class NoteResponse(BaseModel):
    id: uuid.UUID
    module_id: uuid.UUID
    title: str
    content_md: str
    metadata: dict
    created_at: datetime
    updated_at: datetime
    archived: bool

    model_config = {"from_attributes": True}
