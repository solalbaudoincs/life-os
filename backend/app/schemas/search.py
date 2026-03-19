from __future__ import annotations

from pydantic import BaseModel


class SearchResult(BaseModel):
    note_id: str
    title: str
    content_preview: str
    metadata: dict
    module_id: str
    module_name: str
    module_display_name: str
    module_icon: str
    similarity: float
    updated_at: str


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
