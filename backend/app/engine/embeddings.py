"""Mistral embeddings + pgvector search."""

from __future__ import annotations

import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.note import Note
from app.services.mistral_client import get_client


async def embed_text(content: str) -> list[float]:
    """Get embedding vector for a text string."""
    client = get_client()
    resp = await client.embeddings.create_async(
        model=settings.EMBEDDING_MODEL,
        inputs=[content],
    )
    return resp.data[0].embedding


async def embed_and_store(note_id: uuid.UUID, db: AsyncSession) -> None:
    """Compute and store embedding for a note."""
    note = await db.get(Note, note_id)
    if not note:
        return

    content = f"{note.title}\n{note.content_md}"
    embedding = await embed_text(content)

    await db.execute(
        text("UPDATE notes SET embedding = :emb WHERE id = :nid"),
        {"emb": str(embedding), "nid": str(note_id)},
    )
    await db.commit()


async def search_similar(
    query: str,
    db: AsyncSession,
    module_id: uuid.UUID | None = None,
    limit: int = 5,
) -> list[dict]:
    """Semantic search using cosine distance."""
    query_embedding = await embed_text(query)

    emb_str = str(query_embedding)

    # Build query with pgvector cosine distance operator
    # Use CAST() instead of :: to avoid asyncpg bind-param conflicts
    sql = """
        SELECT
            n.id, n.title, n.content_md, n.metadata, n.module_id, n.updated_at,
            m.name as module_name, m.display_name as module_display_name, m.icon as module_icon,
            1 - (n.embedding <=> CAST(:emb AS vector)) as similarity
        FROM notes n
        JOIN modules m ON n.module_id = m.id
        WHERE n.archived = false
          AND n.embedding IS NOT NULL
    """

    params: dict = {"emb": emb_str}

    if module_id:
        sql += " AND n.module_id = :mid"
        params["mid"] = str(module_id)

    sql += " ORDER BY n.embedding <=> CAST(:emb AS vector) LIMIT :lim"
    params["lim"] = limit

    rows = (await db.execute(text(sql), params)).mappings().all()

    results = []
    for r in rows:
        results.append({
            "note_id": str(r["id"]),
            "title": r["title"],
            "content_preview": (r["content_md"] or "")[:120],
            "metadata": r["metadata"],
            "module_id": str(r["module_id"]),
            "module_name": r["module_name"],
            "module_display_name": r["module_display_name"],
            "module_icon": r["module_icon"],
            "similarity": round(float(r["similarity"]), 4),
            "updated_at": r["updated_at"].isoformat(),
        })
    return results
