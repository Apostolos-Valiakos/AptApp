import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.backend import BackendError
from app.tools import ToolContext, available_tools, run_tool

TZ = ZoneInfo("Europe/Athens")
TOMORROW = (datetime.now(TZ) + timedelta(days=1)).date()
SLOT = datetime.combine(TOMORROW, datetime.min.time(), tzinfo=TZ).replace(hour=10)
SLOT_ISO = SLOT.astimezone(ZoneInfo("UTC")).isoformat().replace("+00:00", "Z")


class FakeBackend:
    def __init__(self, self_booking=True):
        self.calls = []
        self.self_booking = self_booking

    async def get(self, path, params=None):
        self.calls.append((path, params))
        if not self.self_booking and path != "/api/v1/portal/appointments/upcoming":
            raise BackendError(404, "self_booking_disabled")
        if path == "/api/v1/portal/services":
            return [{"id": "svc-1", "name": "Sports Massage", "duration_minutes": 60, "price": "33.00"}]
        if path == "/api/v1/portal/staff":
            return [{"id": "staff-1", "name": "Maria"}, {"id": "staff-2", "name": "Olga"}]
        if path == "/api/v1/availability":
            return {"slots": [SLOT_ISO] if params["staff_id"] == "staff-1" else []}
        if path == "/api/v1/portal/appointments/upcoming":
            return [
                {
                    "id": "appt-1",
                    "status": "new",
                    "start_time": SLOT_ISO,
                    "services": [
                        {"service_id": "svc-1", "service_name": "Sports Massage",
                         "staff_id": "staff-1", "staff_name": "Maria"}
                    ],
                }
            ]
        raise AssertionError(path)


def make_ctx(**kwargs):
    backend = FakeBackend(**kwargs)
    return ToolContext(backend=backend, shop_id="shop", timezone=TZ, self_booking_enabled=True), backend


def call(ctx, name, args):
    return asyncio.run(run_tool(ctx, name, args))


def booking_args(**overrides):
    args = {"service_id": "svc-1", "staff_id": "staff-1",
            "date": TOMORROW.isoformat(), "time": "10:00"}
    return {**args, **overrides}


def test_propose_booking_emits_card_for_free_slot():
    ctx, _ = make_ctx()
    result, is_error = call(ctx, "propose_booking", booking_args())
    assert not is_error
    assert ctx.actions == [
        {
            "type": "booking", "service_id": "svc-1", "service_name": "Sports Massage",
            "staff_id": "staff-1", "staff_name": "Maria", "start_time": SLOT_ISO,
            "when": ctx.label(SLOT_ISO), "duration_minutes": 60, "price": 33.0,
        }
    ]


def test_propose_booking_rejects_taken_slot_unknown_ids_and_missing_fields():
    for args in (
        booking_args(time="11:00"),
        booking_args(staff_id="staff-2"),
        booking_args(service_id="invented"),
        booking_args(staff_id="invented"),
        {"service_id": "svc-1", "staff_id": "staff-1"},
        booking_args(date="next tuesday"),
    ):
        ctx, _ = make_ctx()
        _, is_error = call(ctx, "propose_booking", args)
        assert is_error, args
        assert ctx.actions == []


def test_check_availability_fans_out_over_staff_in_local_time():
    ctx, _ = make_ctx()
    result, is_error = call(
        ctx, "check_availability",
        {"service_id": "svc-1", "date": TOMORROW.isoformat(), "staff_id": None},
    )
    assert not is_error
    assert [(s["name"], s["free_start_times"]) for s in result["staff"]] == [
        ("Maria", ["10:00"]), ("Olga", []),
    ]


def test_cancellation_only_for_own_appointments():
    ctx, _ = make_ctx()
    _, is_error = call(ctx, "propose_cancellation", {"appointment_id": "someone-elses"})
    assert is_error and ctx.actions == []
    _, is_error = call(ctx, "propose_cancellation", {"appointment_id": "appt-1"})
    assert not is_error and ctx.actions[0]["type"] == "cancel"


def test_booking_tools_hidden_when_self_booking_is_off():
    names = {t.name for t in available_tools(False)}
    assert names == {"search_policies", "list_my_appointments", "propose_cancellation"}
    ctx, _ = make_ctx()
    ctx.self_booking_enabled = False
    _, is_error = call(ctx, "propose_booking", booking_args())
    assert is_error and ctx.actions == []


def test_backend_only_ever_reads():
    ctx, backend = make_ctx()
    call(ctx, "propose_booking", booking_args())
    call(ctx, "propose_reschedule",
         {"appointment_id": "appt-1", "date": TOMORROW.isoformat(), "time": "10:00", "staff_id": None})
    assert not hasattr(backend, "post")
    assert {path for path, _ in backend.calls} <= {
        "/api/v1/portal/services", "/api/v1/portal/staff",
        "/api/v1/availability", "/api/v1/portal/appointments/upcoming",
    }
