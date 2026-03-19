"""Tool schemas for the proactive agent (Mistral function-calling format)."""

from __future__ import annotations

from app.schemas.module_schema import FieldDefinition


BASE_PROACTIVE_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "think",
            "description": (
                "Use this tool to log your internal reasoning, analysis, and planning. "
                "Call it before taking actions to explain your thought process — what you've "
                "found so far, what you're going to do next, and why. This helps the user "
                "understand your decision-making."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "thought": {
                        "type": "string",
                        "description": "Your internal reasoning, analysis, or planning",
                    },
                },
                "required": ["thought"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_note",
            "description": "Get a note by its ID with full content. Use to read note details for enrichment or analysis.",
            "parameters": {
                "type": "object",
                "properties": {"note_id": {"type": "string"}},
                "required": ["note_id"],
            },
        },
    },
]

PROACTIVE_TOOLS: list[dict] = BASE_PROACTIVE_TOOLS + [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for information. Returns titles, URLs, and snippets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "num_results": {"type": "integer", "default": 5, "description": "Number of results to return"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_page",
            "description": "Fetch a web page and return its text content. Useful for reading job postings, articles, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to fetch"},
                    "max_chars": {"type": "integer", "default": 8000, "description": "Maximum characters to return"},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_notes",
            "description": "Semantic search across existing notes using embeddings. Use to check for duplicates before creating suggestions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "module": {"type": "string", "description": "Module name to filter by (optional)"},
                    "limit": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_suggestion",
            "description": (
                "Create a suggestion for the user to review. The suggestion will be shown in the UI "
                "with Accept/Edit/Reject buttons. Use this instead of creating notes directly. "
                "proposed_payload must be complete — it will be executed as-is when accepted."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "module": {"type": "string", "description": "Target module name"},
                    "type": {
                        "type": "string",
                        "enum": ["new_opportunity", "follow_up", "connection", "alert", "insight", "enrichment"],
                        "description": "Suggestion type",
                    },
                    "title": {"type": "string", "description": "Short title for the suggestion"},
                    "summary": {"type": "string", "description": "Brief explanation of why this is relevant"},
                    "confidence": {"type": "number", "description": "Confidence score 0.0-1.0"},
                    "proposed_action": {
                        "type": "string",
                        "enum": ["create_note", "update_note", "notify"],
                        "description": "What happens when the user accepts",
                    },
                    "proposed_payload": {
                        "type": "object",
                        "description": "Complete payload for the action. For create_note: {title, content_md, metadata}. For update_note: {note_id, ...fields}.",
                    },
                    "data": {
                        "type": "object",
                        "description": "Additional context data (URLs, sources, etc.)",
                    },
                },
                "required": ["module", "type", "title", "summary", "confidence", "proposed_action", "proposed_payload"],
            },
        },
    },
]


def generate_proactive_tools(modules: list[dict]) -> list[dict]:
    """Generate proactive tools: base tools + per-module list tools.

    `modules` is a list of dicts with keys: name, display_name, status_lifecycle.
    """
    tools = list(PROACTIVE_TOOLS)
    for mod in modules:
        name = mod["name"]
        display_name = mod["display_name"]
        status_lifecycle = mod.get("status_lifecycle", [])
        tools.append({
            "type": "function",
            "function": {
                "name": f"list_{name}",
                "description": f"List notes in {display_name} with optional filters",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": (
                            {"type": "string", "enum": status_lifecycle}
                            if status_lifecycle
                            else {"type": "string"}
                        ),
                        "limit": {"type": "integer", "default": 20},
                    },
                    "required": [],
                },
            },
        })
    return tools
