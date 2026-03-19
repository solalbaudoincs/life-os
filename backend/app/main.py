from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.modules import router as modules_router
from app.api.notes import router as notes_router
from app.api.chat import router as chat_router
from app.api.search import router as search_router
from app.api.suggestions import router as suggestions_router
from app.api.briefing import router as briefing_router
from app.api.profile import router as profile_router
from app.api.proactive import router as proactive_router
from app.api.conversations import router as conversations_router
from app.api.voice import router as voice_router
from app.api.mcp_servers import router as mcp_servers_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.engine.scheduler import start_scheduler, stop_scheduler
    from app.engine.mcp_manager import mcp_manager
    from app.database import async_session

    # Start MCP connections
    async with async_session() as db:
        await mcp_manager.startup(db)

    start_scheduler()
    yield
    stop_scheduler()
    await mcp_manager.shutdown()


app = FastAPI(title="Life OS", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(modules_router)
app.include_router(notes_router)
app.include_router(chat_router)
app.include_router(search_router)
app.include_router(suggestions_router)
app.include_router(briefing_router)
app.include_router(profile_router)
app.include_router(proactive_router)
app.include_router(conversations_router)
app.include_router(voice_router)
app.include_router(mcp_servers_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
