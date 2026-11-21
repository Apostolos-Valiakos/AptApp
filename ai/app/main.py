import asyncio
from contextlib import asynccontextmanager
from typing import Literal
from zoneinfo import ZoneInfo

import anthropic
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import config, rag
from .agent import run_chat
from .backend import Backend, BackendError
from .tools import ToolContext


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=15.0)
    app.state.claude = anthropic.AsyncAnthropic()
    # Load the embedding model now, so the first question isn't slow.
    warmup = asyncio.create_task(asyncio.to_thread(rag.warm_up))
    yield
    warmup.cancel()
    await app.state.http.aclose()
    await app.state.claude.close()


app = FastAPI(title="Pure Spa AI assistant", lifespan=lifespan, docs_url=None, redoc_url=None)


class Caller(BaseModel):
    """Who is calling, as stated by the Node API for the forwarded token."""

    role: str
    client_id: str | None
    shop_id: str
    shop_name: str
    client_first_name: str | None
    ai_assistant_enabled: bool
    self_booking_enabled: bool
    timezone: str
    # The shop's online-booking rules (migration 0025); absent from an older API.
    portal_min_notice_minutes: int = 0
    cancellation_note: str | None = None


class Session:
    def __init__(self, caller: Caller, backend: Backend):
        self.caller = caller
        self.backend = backend


async def get_session(request: Request, authorization: str | None = Header(default=None)) -> Session:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing_token")
    backend = Backend(request.app.state.http, authorization)
    try:
        caller = Caller(**await backend.get("/api/v1/ai/context"))
    except BackendError as err:
        if err.status == 429:
            raise HTTPException(429, "rate_limited")
        if err.status in (401, 403):
            raise HTTPException(401, "invalid_token")
        raise HTTPException(502, "backend_unavailable")
    except httpx.HTTPError:
        raise HTTPException(502, "backend_unavailable")
    return Session(caller, backend)


async def get_admin(session: Session = Depends(get_session)) -> Session:
    if session.caller.role not in ("admin", "super_admin"):
        raise HTTPException(403, "admins_only")
    return session


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=config.MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=config.MAX_MESSAGE_CHARS)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=200)
    locale: str = Field(default="el", max_length=10)


def build_messages(body: ChatRequest) -> list[dict]:
    history = [m for m in body.history if m.content.strip()][-config.MAX_HISTORY_MESSAGES :]
    # The API requires the conversation to start with a user turn.
    while history and history[0].role != "user":
        history = history[1:]
    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": body.question})
    return messages


@app.get("/ai/health")
async def health():
    return {"ok": True}


@app.post("/ai/chat")
async def chat(body: ChatRequest, request: Request, session: Session = Depends(get_session)):
    caller = session.caller
    if caller.role != "client" or not caller.client_id:
        raise HTTPException(403, "clients_only")
    if not caller.ai_assistant_enabled:
        raise HTTPException(403, "assistant_disabled")

    ctx = ToolContext(
        backend=session.backend,
        shop_id=caller.shop_id,
        timezone=ZoneInfo(caller.timezone),
        self_booking_enabled=caller.self_booking_enabled,
        notice_minutes=caller.portal_min_notice_minutes,
    )
    events = run_chat(
        request.app.state.claude,
        ctx,
        shop_name=caller.shop_name,
        client_first_name=caller.client_first_name,
        locale=body.locale,
        notice_minutes=caller.portal_min_notice_minutes,
        cancellation_note=caller.cancellation_note,
        messages=build_messages(body),
    )
    return StreamingResponse(
        events,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/ai/documents")
async def list_documents(session: Session = Depends(get_admin)):
    return await asyncio.to_thread(rag.list_documents, session.caller.shop_id)


@app.post("/ai/documents")
async def upload_document(file: UploadFile, session: Session = Depends(get_admin)):
    data = await file.read(config.MAX_UPLOAD_BYTES + 1)
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "file_too_large")
    try:
        return await asyncio.to_thread(
            rag.ingest_bytes, session.caller.shop_id, file.filename or "document", data
        )
    except ValueError as err:
        raise HTTPException(400, str(err))


@app.delete("/ai/documents/{doc_id}")
async def delete_document(doc_id: str, session: Session = Depends(get_admin)):
    if not await asyncio.to_thread(rag.delete_document, session.caller.shop_id, doc_id):
        raise HTTPException(404, "not_found")
    return {"success": True}
