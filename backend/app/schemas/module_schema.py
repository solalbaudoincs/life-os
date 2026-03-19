from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel


class FieldType(str, Enum):
    STRING = "string"
    TEXT = "text"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    DATE = "date"
    DATETIME = "datetime"
    URL = "url"
    EMAIL = "email"
    ENUM = "enum"
    TAGS = "tags"


class FieldDefinition(BaseModel):
    name: str
    type: FieldType
    required: bool = False
    default: str | int | float | bool | None = None
    values: list[str] | None = None
    description: str | None = None


class AlertConfig(BaseModel):
    type: Literal["deadline_approaching", "stale", "status_stuck", "custom"]
    field: str | None = None
    days_before: int | None = None
    days_inactive: int | None = None
    condition: str | None = None


class ActionConfig(BaseModel):
    id: str
    type: Literal["web_search", "internal_scan", "enrichment"]
    name: str
    description: str
    trigger: Literal["scheduled", "on_demand", "on_event"]
    frequency: str | None = None
    config: dict = {}
    mcp_servers: list[str] = []  # server names granted to this action


class ViewConfig(BaseModel):
    name: str
    type: Literal["list", "grouped", "kanban", "table", "calendar"]
    group_by: str | None = None
    sort_by: str | None = None
    filters: dict | None = None


# --- API schemas ---


class ModuleCreate(BaseModel):
    name: str
    display_name: str
    description: str
    icon: str = "folder"
    fields_schema: list[FieldDefinition]
    status_lifecycle: list[str] = []
    alerts_config: list[AlertConfig] = []
    actions_config: list[ActionConfig] = []
    views_config: list[ViewConfig] = []


class ModuleUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    icon: str | None = None
    fields_schema: list[FieldDefinition] | None = None
    status_lifecycle: list[str] | None = None
    alerts_config: list[AlertConfig] | None = None
    actions_config: list[ActionConfig] | None = None
    views_config: list[ViewConfig] | None = None
    sort_order: int | None = None


class ModuleResponse(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str
    description: str
    icon: str
    fields_schema: list[FieldDefinition]
    status_lifecycle: list[str]
    alerts_config: list[AlertConfig]
    actions_config: list[ActionConfig]
    views_config: list[ViewConfig]
    is_system: bool
    sort_order: int
    last_action_runs: dict = {}
    created_at: datetime
    updated_at: datetime
    note_count: int = 0

    model_config = {"from_attributes": True}
