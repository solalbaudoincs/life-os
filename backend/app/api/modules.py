import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.module import Module
from app.models.note import Note
from app.models.suggestion import Suggestion
from app.schemas.module_schema import ModuleCreate, ModuleResponse, ModuleUpdate

router = APIRouter(prefix="/api/modules", tags=["modules"])


@router.get("", response_model=list[ModuleResponse])
async def list_modules(db: AsyncSession = Depends(get_db)):
    # Subquery for note counts
    count_sq = (
        select(Note.module_id, func.count().label("cnt"))
        .where(Note.archived == False)  # noqa: E712
        .group_by(Note.module_id)
        .subquery()
    )
    stmt = (
        select(Module, func.coalesce(count_sq.c.cnt, 0).label("note_count"))
        .outerjoin(count_sq, Module.id == count_sq.c.module_id)
        .order_by(Module.sort_order, Module.created_at)
    )
    rows = (await db.execute(stmt)).all()
    result = []
    for mod, note_count in rows:
        resp = ModuleResponse.model_validate(mod)
        resp.note_count = note_count
        result.append(resp)
    return result


@router.post("", response_model=ModuleResponse, status_code=201)
async def create_module(body: ModuleCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Module).where(Module.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Module '{body.name}' already exists")

    mod = Module(
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        icon=body.icon,
        fields_schema=[f.model_dump() for f in body.fields_schema],
        status_lifecycle=body.status_lifecycle,
        alerts_config=[a.model_dump() for a in body.alerts_config],
        actions_config=[a.model_dump() for a in body.actions_config],
        views_config=[v.model_dump() for v in body.views_config],
    )
    db.add(mod)
    await db.commit()
    await db.refresh(mod)
    resp = ModuleResponse.model_validate(mod)
    resp.note_count = 0
    return resp


@router.put("/reorder", status_code=200)
async def reorder_modules(body: dict, db: AsyncSession = Depends(get_db)):
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(400, "ids list required")
    for idx, mid in enumerate(ids):
        mod = await db.get(Module, uuid.UUID(mid))
        if mod:
            mod.sort_order = idx
    await db.commit()
    return {"ok": True}


@router.put("/{module_id}", response_model=ModuleResponse)
async def update_module(
    module_id: uuid.UUID, body: ModuleUpdate, db: AsyncSession = Depends(get_db)
):
    mod = await db.get(Module, module_id)
    if not mod:
        raise HTTPException(404, "Module not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "fields_schema" and value is not None:
            value = [f.model_dump() if hasattr(f, "model_dump") else f for f in value]
        if field in ("alerts_config", "actions_config", "views_config") and value is not None:
            value = [v.model_dump() if hasattr(v, "model_dump") else v for v in value]
        setattr(mod, field, value)

    await db.commit()
    await db.refresh(mod)
    return ModuleResponse.model_validate(mod)


@router.delete("/{module_id}", status_code=204)
async def delete_module(module_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    mod = await db.get(Module, module_id)
    if not mod:
        raise HTTPException(404, "Module not found")
    # Collect note ids that will be cascade-deleted
    note_ids = (await db.execute(
        select(Note.id).where(Note.module_id == module_id)
    )).scalars().all()
    # Nullify suggestion FKs that lack ON DELETE SET NULL / CASCADE in the DB
    await db.execute(
        update(Suggestion).where(Suggestion.module_id == module_id).values(module_id=None)
    )
    if note_ids:
        await db.execute(
            update(Suggestion).where(Suggestion.related_note_id.in_(note_ids)).values(related_note_id=None)
        )
    await db.delete(mod)
    await db.commit()
