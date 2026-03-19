"""Dynamic Pydantic model generation from module field schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ValidationError, create_model

from app.schemas.module_schema import FieldDefinition, FieldType

_TYPE_MAP: dict[FieldType, type] = {
    FieldType.STRING: str,
    FieldType.TEXT: str,
    FieldType.INTEGER: int,
    FieldType.FLOAT: float,
    FieldType.BOOLEAN: bool,
    FieldType.DATE: date,
    FieldType.DATETIME: datetime,
    FieldType.URL: str,
    FieldType.EMAIL: str,
    FieldType.ENUM: str,
    FieldType.TAGS: list[str],
}


def build_metadata_model(
    module_name: str, fields: list[FieldDefinition]
) -> type[BaseModel]:
    """Build a Pydantic model at runtime from a module's field definitions."""
    field_definitions: dict[str, Any] = {}

    for f in fields:
        python_type = _TYPE_MAP[f.type]

        # Narrow enum to Literal
        if f.type == FieldType.ENUM and f.values:
            python_type = Literal[tuple(f.values)]  # type: ignore[valid-type]

        if f.required:
            field_definitions[f.name] = (python_type, ...)
        else:
            field_definitions[f.name] = (python_type | None, f.default)

    return create_model(f"{module_name}_metadata", **field_definitions)


def validate_metadata(
    module_name: str,
    fields: list[FieldDefinition],
    metadata: dict,
) -> dict:
    """Validate and coerce metadata against the module schema.

    Returns the validated dict. Raises ValueError on validation failure.
    """
    model = build_metadata_model(module_name, fields)
    try:
        validated = model.model_validate(metadata)
    except ValidationError as e:
        raise ValueError(str(e)) from e
    # model_dump(mode="json") serializes date/datetime to ISO strings
    return validated.model_dump(mode="json")
