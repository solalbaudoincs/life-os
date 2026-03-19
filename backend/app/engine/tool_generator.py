"""Generate Mistral function-calling tool definitions from module schemas."""

from __future__ import annotations

from app.schemas.module_schema import FieldDefinition, FieldType

FIELD_TYPE_MAP = {
    FieldType.STRING: {"type": "string"},
    FieldType.TEXT: {"type": "string"},
    FieldType.INTEGER: {"type": "integer"},
    FieldType.FLOAT: {"type": "number"},
    FieldType.BOOLEAN: {"type": "boolean"},
    FieldType.DATE: {"type": "string", "description": "ISO date YYYY-MM-DD"},
    FieldType.DATETIME: {"type": "string", "description": "ISO datetime"},
    FieldType.URL: {"type": "string", "format": "uri"},
    FieldType.EMAIL: {"type": "string", "format": "email"},
    FieldType.ENUM: {"type": "string"},
    FieldType.TAGS: {"type": "array", "items": {"type": "string"}},
}


def generate_tools_for_module(
    name: str,
    display_name: str,
    description: str,
    fields: list[FieldDefinition],
    status_lifecycle: list[str],
) -> list[dict]:
    """Generate create/update/list tools for a single module."""
    properties = {}
    required = []
    for f in fields:
        prop = {**FIELD_TYPE_MAP[f.type]}
        if f.description:
            prop["description"] = f.description
        if f.type == FieldType.ENUM and f.values:
            prop["enum"] = f.values
        properties[f.name] = prop
        if f.required:
            required.append(f.name)

    tools = [
        {
            "type": "function",
            "function": {
                "name": f"create_{name}",
                "description": f"Create a new note in {display_name}. {description}",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Note title"},
                        "content_md": {"type": "string", "description": "Markdown content"},
                        **properties,
                    },
                    "required": ["title"] + required,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": f"update_{name}",
                "description": f"Update an existing note in {display_name}",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "note_id": {"type": "string", "description": "UUID of the note"},
                        "title": {"type": "string"},
                        "content_md": {"type": "string"},
                        **properties,
                    },
                    "required": ["note_id"],
                },
            },
        },
        {
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
        },
    ]
    return tools


META_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_notes",
            "description": "Semantic search across all notes using embeddings",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "module": {"type": "string", "description": "Filter by module name (optional)"},
                    "limit": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_note",
            "description": "Get a note by its ID with full content",
            "parameters": {
                "type": "object",
                "properties": {"note_id": {"type": "string"}},
                "required": ["note_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_note",
            "description": "Archive a note",
            "parameters": {
                "type": "object",
                "properties": {"note_id": {"type": "string"}},
                "required": ["note_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_modules",
            "description": "List all modules in Life OS with their field schemas and note counts",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_module",
            "description": "Update an existing module's configuration (display name, description, icon, fields, lifecycle, alerts, actions)",
            "parameters": {
                "type": "object",
                "properties": {
                    "module_name": {
                        "type": "string",
                        "description": "snake_case name of the module to update",
                    },
                    "display_name": {"type": "string"},
                    "description": {"type": "string"},
                    "icon": {"type": "string"},
                    "fields_schema": {
                        "type": "array",
                        "description": "Replacement field definitions (replaces all existing fields)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {
                                    "type": "string",
                                    "enum": ["string", "text", "integer", "float", "boolean", "date", "datetime", "url", "email", "enum", "tags"],
                                },
                                "required": {"type": "boolean"},
                                "default": {"description": "Default value"},
                                "values": {"type": "array", "items": {"type": "string"}},
                                "description": {"type": "string"},
                            },
                            "required": ["name", "type"],
                        },
                    },
                    "status_lifecycle": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "alerts_config": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string", "enum": ["deadline_approaching", "stale", "status_stuck", "custom"]},
                                "field": {"type": "string"},
                                "days_before": {"type": "integer"},
                                "days_inactive": {"type": "integer"},
                                "condition": {"type": "string"},
                            },
                            "required": ["type"],
                        },
                    },
                    "actions_config": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "type": {"type": "string", "enum": ["web_search", "internal_scan", "enrichment"]},
                                "name": {"type": "string"},
                                "description": {"type": "string"},
                                "trigger": {"type": "string", "enum": ["scheduled", "on_demand", "on_event"]},
                                "frequency": {"type": "string", "enum": ["hourly", "daily", "weekly", "monthly"]},
                                "config": {"type": "object"},
                                "mcp_servers": {"type": "array", "items": {"type": "string"}},
                            },
                            "required": ["id", "type", "name", "description", "trigger"],
                        },
                    },
                },
                "required": ["module_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_module",
            "description": "DANGEROUS: Permanently delete a module and ALL its notes. This cannot be undone. Requires user confirmation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "module_name": {
                        "type": "string",
                        "description": "snake_case name of the module to delete",
                    },
                },
                "required": ["module_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_suggestions",
            "description": "List suggestions from the proactive agent with optional status filter",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["pending", "accepted", "rejected", "snoozed"],
                        "description": "Filter by status (default: pending)",
                    },
                    "limit": {"type": "integer", "default": 10},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "accept_suggestion",
            "description": "Accept a suggestion — executes its proposed action (create or update a note)",
            "parameters": {
                "type": "object",
                "properties": {
                    "suggestion_id": {"type": "string", "description": "UUID of the suggestion"},
                },
                "required": ["suggestion_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reject_suggestion",
            "description": "Reject a suggestion — marks it as rejected so it won't be suggested again",
            "parameters": {
                "type": "object",
                "properties": {
                    "suggestion_id": {"type": "string", "description": "UUID of the suggestion"},
                },
                "required": ["suggestion_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "snooze_suggestion",
            "description": "Snooze a suggestion for a number of hours",
            "parameters": {
                "type": "object",
                "properties": {
                    "suggestion_id": {"type": "string", "description": "UUID of the suggestion"},
                    "hours": {"type": "integer", "default": 24, "description": "Hours to snooze"},
                },
                "required": ["suggestion_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_profile",
            "description": "Get the user's profile data (preferences, background, goals)",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_profile",
            "description": "Update the user's profile with new information (merges with existing data)",
            "parameters": {
                "type": "object",
                "properties": {
                    "data": {"type": "object", "description": "Key-value pairs to merge into the profile"},
                },
                "required": ["data"],
            },
        },
    },
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
            "description": "Fetch a web page and return its text content. Useful for reading articles, postings, etc.",
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
            "name": "trigger_scan",
            "description": "Trigger a proactive agent scan. Can scan all modules or a specific one.",
            "parameters": {
                "type": "object",
                "properties": {
                    "module": {"type": "string", "description": "Module name to scan (omit to scan all modules)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "preview_module",
            "description": "Show the user a visual preview of a module definition before creating it. Always call this before create_module so the user can review and approve the design.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "snake_case identifier"},
                    "display_name": {"type": "string"},
                    "description": {"type": "string"},
                    "icon": {"type": "string", "description": "Single emoji icon"},
                    "fields_schema": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {"type": "string", "enum": ["string", "text", "integer", "float", "boolean", "date", "datetime", "url", "email", "enum", "tags"]},
                                "required": {"type": "boolean"},
                                "values": {"type": "array", "items": {"type": "string"}},
                                "description": {"type": "string"},
                            },
                            "required": ["name", "type"],
                        },
                    },
                    "status_lifecycle": {"type": "array", "items": {"type": "string"}},
                    "alerts_config": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string", "enum": ["deadline_approaching", "stale", "status_stuck", "custom"]},
                                "field": {"type": "string"},
                                "days_before": {"type": "integer"},
                                "days_inactive": {"type": "integer"},
                            },
                            "required": ["type"],
                        },
                    },
                    "actions_config": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "type": {"type": "string", "enum": ["web_search", "internal_scan", "enrichment"]},
                                "name": {"type": "string"},
                                "description": {"type": "string"},
                                "trigger": {"type": "string", "enum": ["scheduled", "on_demand", "on_event"]},
                                "frequency": {"type": "string", "enum": ["hourly", "daily", "weekly", "monthly"]},
                                "config": {"type": "object"},
                            },
                            "required": ["id", "type", "name", "description", "trigger"],
                        },
                    },
                },
                "required": ["name", "display_name", "description", "icon", "fields_schema", "status_lifecycle"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_module",
            "description": "Create a new module in Life OS. Always call preview_module first to let the user review the design before creating.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "snake_case identifier for the module (e.g. 'habit_tracker')",
                    },
                    "display_name": {
                        "type": "string",
                        "description": "Human-readable name (e.g. 'Habit Tracker')",
                    },
                    "description": {
                        "type": "string",
                        "description": "One-line description of what this module tracks",
                    },
                    "icon": {
                        "type": "string",
                        "description": "Single emoji icon for the module",
                    },
                    "fields_schema": {
                        "type": "array",
                        "description": "Field definitions for notes in this module",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "Field identifier (snake_case)"},
                                "type": {
                                    "type": "string",
                                    "enum": ["string", "text", "integer", "float", "boolean", "date", "datetime", "url", "email", "enum", "tags"],
                                    "description": "Field data type",
                                },
                                "required": {"type": "boolean", "description": "Whether this field is required"},
                                "default": {"description": "Default value for the field"},
                                "values": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Allowed values (for enum type)",
                                },
                                "description": {"type": "string", "description": "Human-readable field description"},
                            },
                            "required": ["name", "type"],
                        },
                    },
                    "status_lifecycle": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Ordered list of status stages (e.g. ['todo', 'in_progress', 'done'])",
                    },
                    "alerts_config": {
                        "type": "array",
                        "description": "Rule-based alerts for this module (optional)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {
                                    "type": "string",
                                    "enum": ["deadline_approaching", "stale", "status_stuck", "custom"],
                                    "description": "Alert type",
                                },
                                "field": {"type": "string", "description": "Field name to monitor (for deadline alerts)"},
                                "days_before": {"type": "integer", "description": "Days before deadline to alert"},
                                "days_inactive": {"type": "integer", "description": "Days of inactivity before alerting (for stale/status_stuck)"},
                                "condition": {"type": "string", "description": "Custom condition expression"},
                            },
                            "required": ["type"],
                        },
                    },
                    "actions_config": {
                        "type": "array",
                        "description": "Proactive agent actions that run on a schedule (optional)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string", "description": "Unique action identifier (snake_case)"},
                                "type": {
                                    "type": "string",
                                    "enum": ["web_search", "internal_scan", "enrichment"],
                                    "description": "web_search: find new items on the web; internal_scan: cross-module analysis; enrichment: enrich existing notes",
                                },
                                "name": {"type": "string", "description": "Human-readable action name"},
                                "description": {"type": "string", "description": "What this action does"},
                                "trigger": {
                                    "type": "string",
                                    "enum": ["scheduled", "on_demand", "on_event"],
                                    "description": "When this action runs",
                                },
                                "frequency": {
                                    "type": "string",
                                    "enum": ["hourly", "daily", "weekly", "monthly"],
                                    "description": "How often to run (for scheduled trigger)",
                                },
                                "config": {
                                    "type": "object",
                                    "description": "Additional config, e.g. {queries: ['search term 1', 'search term 2']} for web_search actions",
                                },
                                "mcp_servers": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "MCP server names this action can access (e.g., ['github', 'slack'])",
                                },
                            },
                            "required": ["id", "type", "name", "description", "trigger"],
                        },
                    },
                },
                "required": ["name", "display_name", "description", "icon", "fields_schema", "status_lifecycle"],
            },
        },
    },
]


MCP_META_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "list_mcp_servers",
            "description": "List all registered MCP servers with their status (enabled, connected, tool count)",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_mcp_server",
            "description": "Register a new MCP server. For SSE transport, config needs 'url'. For STDIO, config needs 'command' and optionally 'args' and 'env'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Unique snake_case identifier (e.g., 'github')"},
                    "display_name": {"type": "string", "description": "Human-readable name (e.g., 'GitHub')"},
                    "description": {"type": "string", "description": "What this server provides"},
                    "transport": {"type": "string", "enum": ["sse", "stdio"], "description": "Connection transport type"},
                    "config": {
                        "type": "object",
                        "description": "Transport config. SSE: {url, headers?}. STDIO: {command, args?, env?}",
                    },
                },
                "required": ["name", "display_name", "transport", "config"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_mcp_server",
            "description": "Remove a registered MCP server",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Server name to remove"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "toggle_mcp_server",
            "description": "Enable or disable an MCP server",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Server name"},
                    "enabled": {"type": "boolean", "description": "True to enable, false to disable"},
                },
                "required": ["name", "enabled"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_mcp_tools",
            "description": "List all available MCP tools across all connected servers",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


def generate_all_tools(modules: list[dict]) -> list[dict]:
    """Generate all tools: meta + per-module + MCP management.

    `modules` is a list of dicts with keys: name, display_name, description,
    fields (list[FieldDefinition]), status_lifecycle.
    """
    all_tools = list(META_TOOLS) + list(MCP_META_TOOLS)
    for mod in modules:
        all_tools.extend(
            generate_tools_for_module(
                name=mod["name"],
                display_name=mod["display_name"],
                description=mod["description"],
                fields=mod["fields"],
                status_lifecycle=mod["status_lifecycle"],
            )
        )
    return all_tools
