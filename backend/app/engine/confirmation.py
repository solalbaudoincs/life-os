"""Registry of dangerous tools that require user confirmation before execution."""

from __future__ import annotations

DANGEROUS_TOOLS: dict[str, dict] = {
    "delete_module": {
        "title": "Delete Module",
        "description": "Permanently delete this module and ALL its notes. This cannot be undone.",
        "confirm_label": "Delete Module",
        "destructive": True,
    },
}


def is_dangerous(tool_name: str) -> bool:
    """Check if a tool requires user confirmation."""
    return tool_name in DANGEROUS_TOOLS


def get_confirmation_info(tool_name: str) -> dict:
    """Get the confirmation UI metadata for a dangerous tool."""
    return DANGEROUS_TOOLS.get(tool_name, {})
