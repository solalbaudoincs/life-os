# Life OS

A personal life management system — a structured Markdown vault in the browser with a Mistral AI agent as the intelligence layer.

## Quick Start with Docker

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- A [Mistral AI API key](https://console.mistral.ai/)
- (Optional) A [Brave Search API key](https://brave.com/search/api/) for web search

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your keys:

```env
MISTRAL_API_KEY=your_mistral_api_key_here
BRAVE_SEARCH_API_KEY=your_brave_search_api_key_here   # optional
```

> `DATABASE_URL` is set automatically by Docker Compose — you don't need to change it.

### 2. Start the app

```bash
docker compose up -d
```

This starts four services:

| Service | Description | Port |
|---------|-------------|------|
| `db` | PostgreSQL 17 + pgvector | 5432 |
| `migrate` | Runs Alembic migrations then exits | — |
| `backend` | FastAPI + Mistral agent | 8000 |
| `frontend` | Nginx serving the React app | **3000** |

Open **http://localhost:3000** once all services are up.

### 3. Verify

```bash
# Check all services are running
docker compose ps

# Check backend health
curl http://localhost:3000/health
```

### Rebuild after code changes

```bash
docker compose up -d --build
```

### Stop

```bash
docker compose down          # stop containers, keep data
docker compose down -v       # stop and delete database volume
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MISTRAL_API_KEY` | Yes | — | Mistral AI API key |
| `BRAVE_SEARCH_API_KEY` | No | — | Brave Search API key (enables web search; falls back to DuckDuckGo) |
| `DATABASE_URL` | No | Set by Compose | PostgreSQL connection string (override only for external DB) |
| `CHAT_MODEL` | No | `mistral-large-latest` | Mistral model for the interactive agent |
| `PROACTIVE_MODEL` | No | `mistral-large-latest` | Mistral model for the proactive agent |
| `EMBEDDING_MODEL` | No | `mistral-embed` | Model for note embeddings |
| `VOICE_MODEL` | No | `voxtral-mini-transcribe-2507` | Model for voice transcription |

## Local Development (without Docker)

### Backend

```bash
cd backend
uv sync                          # install Python deps
cp ../.env.example ../.env       # configure keys
# Start PostgreSQL with pgvector locally, then:
.venv/bin/alembic -c alembic.ini upgrade head
.venv/bin/uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev                      # dev server on :5173, proxies /api to :8000
```

## Architecture

- **Frontend**: React + Vite + Tailwind + shadcn/ui
- **Backend**: FastAPI + SQLAlchemy (async) + Alembic
- **Database**: PostgreSQL + pgvector (1024-dim embeddings)
- **AI**: Mistral AI (function calling, structured output, streaming)
- **Two-agent system**: Interactive agent (chat) + Proactive agent (scheduled suggestions)
