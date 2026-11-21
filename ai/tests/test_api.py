"""The HTTP layer, with the Node API and the model both replaced by fakes."""

import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from tests.test_tools import SLOT_ISO, TOMORROW, FakeBackend

CONTEXT = {
    "role": "client", "client_id": "client-1", "shop_id": "shop", "shop_name": "Pure Spa",
    "client_first_name": "Anna", "ai_assistant_enabled": True, "self_booking_enabled": True,
    "timezone": "Europe/Athens",
}


class FakeStream:
    def __init__(self, message):
        self.message = message

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def __aiter__(self):
        async def events():
            for block in self.message.content:
                if block.type == "text":
                    yield SimpleNamespace(type="text", text=block.text)

        return events()

    async def get_final_message(self):
        return self.message


class FakeClaude:
    """Replays scripted turns and records every request it was sent."""

    def __init__(self, turns):
        self.turns = list(turns)
        self.requests = []
        self.messages = self

    def stream(self, **kwargs):
        self.requests.append({**kwargs, "messages": list(kwargs["messages"])})
        return FakeStream(self.turns.pop(0))

    async def close(self):
        pass


def text(value):
    return SimpleNamespace(type="text", text=value)


def tool_use(name, args):
    return SimpleNamespace(type="tool_use", id=f"tu_{name}", name=name, input=args)


def message(*content, stop_reason="end_turn"):
    usage = SimpleNamespace(input_tokens=10, output_tokens=5)
    return SimpleNamespace(content=list(content), stop_reason=stop_reason, usage=usage)


@pytest.fixture
def client(monkeypatch):
    state = {"context": dict(CONTEXT), "status": 200, "backend": FakeBackend(), "seen_auth": []}

    class Backend:
        def __init__(self, http, authorization):
            state["seen_auth"].append(authorization)

        async def get(self, path, params=None):
            if path == "/api/v1/ai/context":
                if state["status"] != 200:
                    raise main.BackendError(state["status"], "x")
                return state["context"]
            return await state["backend"].get(path, params)

    monkeypatch.setattr(main, "Backend", Backend)
    with TestClient(main.app) as test_client:
        test_client.state = state
        yield test_client


def events(response):
    parsed = []
    for chunk in response.text.strip().split("\n\n"):
        name, data = chunk.split("\n", 1)
        parsed.append((name.removeprefix("event: "), json.loads(data.removeprefix("data: "))))
    return parsed


AUTH = {"Authorization": "Bearer client-token"}


def test_chat_requires_a_token_and_a_client_with_the_assistant_enabled(client):
    assert client.post("/ai/chat", json={"question": "hi"}).status_code == 401

    client.state["status"] = 403
    assert client.post("/ai/chat", json={"question": "hi"}, headers=AUTH).status_code == 401
    client.state["status"] = 429
    assert client.post("/ai/chat", json={"question": "hi"}, headers=AUTH).status_code == 429
    client.state["status"] = 200

    client.state["context"]["role"] = "admin"
    assert client.post("/ai/chat", json={"question": "hi"}, headers=AUTH).status_code == 403
    client.state["context"]["role"] = "client"
    client.state["context"]["ai_assistant_enabled"] = False
    assert client.post("/ai/chat", json={"question": "hi"}, headers=AUTH).status_code == 403


def test_chat_streams_text_runs_tools_and_emits_a_card(client):
    booking = {"service_id": "svc-1", "staff_id": "staff-1",
               "date": TOMORROW.isoformat(), "time": "10:00"}
    claude = FakeClaude([
        message(text("Let me check. "), tool_use("propose_booking", booking), stop_reason="tool_use"),
        message(text("Please press Confirm.")),
    ])
    main.app.state.claude = claude

    response = client.post(
        "/ai/chat",
        json={"question": "Book it", "history": [{"role": "user", "content": "Sports massage tomorrow 10:00 with Maria"}]},
        headers=AUTH,
    )
    assert response.status_code == 200
    got = events(response)
    # The note written before the tool call is withdrawn with a reset event.
    assert [name for name, _ in got] == ["text", "reset", "status", "action", "text", "done"]
    assert got[3][1]["type"] == "booking" and got[3][1]["start_time"] == SLOT_ISO

    # The token is forwarded to the Node API, and never shown to the model.
    assert set(client.state["seen_auth"]) == {"Bearer client-token"}
    assert "client-token" not in json.dumps(claude.requests, default=str)

    # Second request carries the assistant turn and one tool_result per tool_use.
    follow_up = claude.requests[1]["messages"]
    assert follow_up[-2]["role"] == "assistant"
    assert [b["tool_use_id"] for b in follow_up[-1]["content"]] == ["tu_propose_booking"]
    assert follow_up[0] == {"role": "user", "content": "Sports massage tomorrow 10:00 with Maria"}


def test_self_booking_off_hides_booking_tools_from_the_model(client):
    client.state["context"]["self_booking_enabled"] = False
    claude = FakeClaude([message(text("Please contact the spa."))])
    main.app.state.claude = claude
    client.post("/ai/chat", json={"question": "book"}, headers=AUTH)
    assert {t["name"] for t in claude.requests[0]["tools"]} == {
        "search_policies", "list_my_appointments", "propose_cancellation",
    }


def test_documents_are_admin_only(client):
    assert client.get("/ai/documents", headers=AUTH).status_code == 403
    client.state["context"]["role"] = "frontdesk"
    assert client.get("/ai/documents", headers=AUTH).status_code == 403
    assert client.delete("/ai/documents/" + "a" * 32, headers=AUTH).status_code == 403


def test_a_reply_that_never_stops_calling_tools_ends_with_an_error(client):
    # Every step asks for another tool: after the last allowed step the client
    # is told something went wrong instead of being left with nothing.
    turns = [message(tool_use("list_services", {}), stop_reason="tool_use") for _ in range(main.config.MAX_AGENT_TURNS)]
    main.app.state.claude = FakeClaude(turns)
    got = events(client.post("/ai/chat", json={"question": "services?"}, headers=AUTH))
    assert got[-2] == ("error", {"code": "too_long"})
    assert got[-1][0] == "done"


def test_the_shops_notice_and_cancellation_note_reach_the_model(client):
    client.state["context"]["portal_min_notice_minutes"] = 1440
    client.state["context"]["cancellation_note"] = "Free cancellation up to 24 hours before."
    claude = FakeClaude([message(text("ok"))])
    main.app.state.claude = claude
    client.post("/ai/chat", json={"question": "cancel policy?"}, headers=AUTH)
    dynamic = claude.requests[0]["system"][1]["text"]
    assert "24 hours before they start" in dynamic
    assert "Free cancellation up to 24 hours before." in dynamic
    # The cached part of the instructions stays the same for every shop.
    assert claude.requests[0]["system"][0]["text"] == main.run_chat.__globals__["STABLE_SYSTEM"]
