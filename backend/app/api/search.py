import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.engine.embeddings import embed_and_store, search_similar
from app.models.note import Note
from app.schemas.search import SearchResponse

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1),
    module: uuid.UUID | None = Query(None),
    limit: int = Query(5, le=20),
    db: AsyncSession = Depends(get_db),
):
    results = await search_similar(q, db, module_id=module, limit=limit)
    return SearchResponse(query=q, results=results)


@router.post("/reindex", tags=["search"])
async def reindex_embeddings(db: AsyncSession = Depends(get_db)):
    """Backfill embeddings for all notes that don't have one."""
    stmt = select(Note.id).where(Note.archived == False, Note.embedding == None)  # noqa: E711, E712
    ids = (await db.execute(stmt)).scalars().all()
    for nid in ids:
        await embed_and_store(nid, db)
    return {"reindexed": len(ids)}
