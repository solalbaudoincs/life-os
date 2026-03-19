"""Wrapper around the Mistral SDK."""

import asyncio
import logging
import re

from mistralai.client.sdk import Mistral

from app.config import settings

logger = logging.getLogger(__name__)

_MAX_RETRIES = 4
_BASE_DELAY = 2.0
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

_client: Mistral | None = None


def get_client() -> Mistral:
    global _client
    if _client is None:
        _client = Mistral(api_key=settings.MISTRAL_API_KEY)
    return _client


def _is_retryable(exc: Exception) -> bool:
    msg = str(exc)
    match = re.search(r"Status (\d{3})", msg)
    if match:
        return int(match.group(1)) in _RETRYABLE_STATUS_CODES
    lower = msg.lower()
    return "rate limit" in lower or "too many requests" in lower


def _get_retry_after(exc: Exception) -> float | None:
    msg = str(exc)
    match = re.search(r"[Rr]etry.?[Aa]fter[\":\s]+(\d+\.?\d*)", msg)
    return float(match.group(1)) if match else None


async def chat_with_tools(
    messages: list[dict],
    tools: list[dict],
    model: str | None = None,
) -> dict:
    """Send a chat completion request with tools. Retries on 429/5xx."""
    client = get_client()
    for attempt in range(_MAX_RETRIES):
        try:
            resp = await client.chat.complete_async(
                model=model or settings.CHAT_MODEL,
                messages=messages,
                tools=tools if tools else None,
            )
            return resp
        except Exception as e:
            if attempt < _MAX_RETRIES - 1 and _is_retryable(e):
                retry_after = _get_retry_after(e)
                delay = retry_after if retry_after else _BASE_DELAY * (2 ** attempt)
                logger.warning("Chat API call failed (attempt %d/%d), retrying in %.1fs: %s", attempt + 1, _MAX_RETRIES, delay, e)
                await asyncio.sleep(delay)
            else:
                raise


async def stream_with_tools(
    messages: list[dict],
    tools: list[dict],
    response_format_model: type | None = None,
    model: str | None = None,
):
    """Start a streaming chat completion with tools. Retries on 429/5xx.

    If response_format_model is provided (a Pydantic BaseModel subclass), the model's
    text responses will be constrained to valid JSON matching that schema.
    Tool calls are unaffected by response_format.
    """
    from mistralai.extra.utils.response_format import response_format_from_pydantic_model

    client = get_client()
    kwargs = dict(
        model=model or settings.CHAT_MODEL,
        messages=messages,
        tools=tools if tools else None,
    )
    if response_format_model is not None:
        kwargs["response_format"] = response_format_from_pydantic_model(response_format_model)

    for attempt in range(_MAX_RETRIES):
        try:
            return await client.chat.stream_async(**kwargs)
        except Exception as e:
            if attempt < _MAX_RETRIES - 1 and _is_retryable(e):
                retry_after = _get_retry_after(e)
                delay = retry_after if retry_after else _BASE_DELAY * (2 ** attempt)
                logger.warning("Stream API call failed (attempt %d/%d), retrying in %.1fs: %s", attempt + 1, _MAX_RETRIES, delay, e)
                await asyncio.sleep(delay)
            else:
                raise


async def transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio bytes using Mistral's audio transcription API."""
    client = get_client()
    resp = await client.audio.transcriptions.complete_async(
        model=settings.VOICE_MODEL,
        file={"file_name": filename, "content": audio_bytes},
    )
    return resp.text
