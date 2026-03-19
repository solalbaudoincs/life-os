import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from app.engine.embeddings import embed_and_store
from app.engine.schema_engine import validate_metadata

logger = logging.getLogger(__name__)
from app.models.module import Module
from app.models.note import Note
from app.schemas.module_schema import FieldDefinition
from app.schemas.note import NoteCreate, NoteResponse, NoteUpdate

router = APIRouter(prefix="/api/notes", tags=["notes"])


def _to_response(note: Note) -> NoteResponse:
    return NoteResponse(
        id=note.id,
        module_id=note.module_id,
        title=note.title,
        content_md=note.content_md,
        metadata=note.metadata_,
        created_at=note.created_at,
        updated_at=note.updated_at,
        archived=note.archived,
    )


async def _get_module(db: AsyncSession, module_id: uuid.UUID) -> Module:
    mod = await db.get(Module, module_id)
    if not mod:
        raise HTTPException(404, "Module not found")
    return mod


def _parse_fields(mod: Module) -> list[FieldDefinition]:
    return [FieldDefinition.model_validate(f) for f in mod.fields_schema]


@router.get("", response_model=list[NoteResponse])
async def list_notes(
    module: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    sort_by: str = Query("updated_at"),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Note).where(Note.archived == False)  # noqa: E712

    if module:
        stmt = stmt.where(Note.module_id == module)
    if status:
        stmt = stmt.where(Note.metadata_["status"].astext == status)

    if sort_by == "title":
        stmt = stmt.order_by(Note.title)
    elif sort_by == "created_at":
        stmt = stmt.order_by(Note.created_at.desc())
    else:
        stmt = stmt.order_by(Note.updated_at.desc())

    stmt = stmt.limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_response(r) for r in rows]


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(body: NoteCreate, db: AsyncSession = Depends(get_db)):
    mod = await _get_module(db, body.module_id)
    fields = _parse_fields(mod)

    try:
        validated_meta = validate_metadata(mod.name, fields, body.metadata)
    except ValueError as e:
        raise HTTPException(422, str(e))

    note = Note(
        module_id=body.module_id,
        title=body.title,
        content_md=body.content_md,
        metadata_=validated_meta,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)

    # Embed in background (immediate – no debounce for new notes)
    asyncio.create_task(_embed_bg_immediate(note.id))

    return _to_response(note)


async def _embed_bg_immediate(note_id: uuid.UUID) -> None:
    """Embed immediately (used for newly created notes)."""
    try:
        async with async_session() as db:
            await embed_and_store(note_id, db)
    except Exception:
        logger.exception("Failed to embed note %s", note_id)


_embed_timers: dict[str, asyncio.Task] = {}
EMBED_DEBOUNCE_SECONDS = 30


async def _embed_bg(note_id: uuid.UUID) -> None:
    """Debounced embedding: waits EMBED_DEBOUNCE_SECONDS after the last update
    before computing the embedding, so rapid saves don't each trigger an API call."""
    key = str(note_id)

    # Cancel any existing pending embed for this note
    existing = _embed_timers.pop(key, None)
    if existing and not existing.done():
        existing.cancel()

    async def _delayed_embed() -> None:
        try:
            await asyncio.sleep(EMBED_DEBOUNCE_SECONDS)
            async with async_session() as db:
                await embed_and_store(note_id, db)
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Failed to embed note %s", note_id)
        finally:
            _embed_timers.pop(key, None)

    _embed_timers[key] = asyncio.create_task(_delayed_embed())


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(note_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    note = await db.get(Note, note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    return _to_response(note)


@router.put("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: uuid.UUID, body: NoteUpdate, db: AsyncSession = Depends(get_db)
):
    note = await db.get(Note, note_id)
    if not note:
        raise HTTPException(404, "Note not found")

    if body.title is not None:
        note.title = body.title
    if body.content_md is not None:
        note.content_md = body.content_md
    if body.archived is not None:
        note.archived = body.archived
    if body.metadata is not None:
        mod = await _get_module(db, note.module_id)
        fields = _parse_fields(mod)
        try:
            note.metadata_ = validate_metadata(mod.name, fields, body.metadata)
        except ValueError as e:
            raise HTTPException(422, str(e))

    await db.commit()
    await db.refresh(note)

    # Re-embed in background
    asyncio.create_task(_embed_bg(note.id))

    return _to_response(note)


@router.delete("/{note_id}", status_code=204)
async def delete_note(note_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    note = await db.get(Note, note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    note.archived = True
    await db.commit()
