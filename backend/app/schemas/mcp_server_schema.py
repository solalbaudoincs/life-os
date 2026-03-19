"""Pydantic schemas for MCP server API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class McpServerCreate(BaseModel):
    name: str
    display_name: str
    description: str = ""
    transport: Literal["sse", "stdio"]
    config: dict
    enabled: bool = True


class McpServerUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    transport: Literal["sse", "stdio"] | None = None
    config: dict | None = None
    enabled: bool | None = None


class McpToolInfo(BaseModel):
    name: str
    description: str | None = None
    parameters: dict | None = None


class McpServerResponse(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str
    description: str
    transport: str
    config: dict
    enabled: bool
    cached_tools: list[McpToolInfo]
    last_connected_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
