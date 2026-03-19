import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class McpServer(Base):
    __tablename__ = "mcp_servers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")

    # "sse" or "stdio"
    transport: Mapped[str] = mapped_column(String(16), nullable=False)

    # Transport-specific config (JSONB):
    #   SSE:   {url, headers?, timeout?, sse_read_timeout?}
    #   STDIO: {command, args?, env?}
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Cached tool list from last successful get_tools()
    cached_tools: Mapped[list] = mapped_column(JSONB, default=list)
    last_connected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
