"""Tools the model may call. All of them are read-only.

The propose_* tools do not book, cancel or move anything: they validate the
request against live data and queue an action card for the browser. Only the
client pressing Confirm in the browser performs the change.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import date as date_type, datetime, time as time_type
from typing import Awaitable, Callable
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, ValidationError

from . import rag
from .backend import Backend, BackendError

NEVER_GUESS = (
    "Do NOT guess or invent missing details. If the client has not given a specific "
    "service, date or time, ask them for it before calling this tool."
)


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SearchPoliciesArgs(_Args):
    query: str


class NoArgs(_Args):
    pass


class ListStaffArgs(_Args):
    service_id: str


class CheckAvailabilityArgs(_Args):
    service_id: str
    date: date_type
    staff_id: str | None


class ProposeBookingArgs(_Args):
    service_id: str
    staff_id: str
    date: date_type
    time: time_type


class ProposeCancellationArgs(_Args):
    appointment_id: str


class ProposeRescheduleArgs(_Args):
    appointment_id: str
    date: date_type
    time: time_type
    staff_id: str | None


def _schema(properties: dict) -> dict:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


_STR = {"type": "string"}
_DATE = {"type": "string", "description": "Calendar date, YYYY-MM-DD, in the spa's local time."}
_TIME = {"type": "string", "description": "Start time, 24-hour HH:MM, in the spa's local time."}
_OPTIONAL_STAFF = {
    "type": ["string", "null"],
    "description": "Staff id from list_staff, or null when the client has no preference.",
}


class ToolError(Exception):
    """A message for the model explaining why the call could not be done."""


@dataclass
class ToolContext:
    backend: Backend
    shop_id: str
    timezone: ZoneInfo
    self_booking_enabled: bool
    actions: list[dict] = field(default_factory=list)
    _services: list[dict] | None = None
    _staff: dict[str, list[dict]] = field(default_factory=dict)
    _appointments: list[dict] | None = None

    # ---- cached lookups against the Node API -------------------------------

    async def services(self) -> list[dict]:
        if self._services is None:
            self._services = await self.backend.get("/api/v1/portal/services")
        return self._services

    async def service(self, service_id: str) -> dict:
        for svc in await self.services():
            if svc["id"] == service_id:
                return svc
        raise ToolError("Unknown service_id. Call list_services and use an id from its result.")

    async def staff_for(self, service_id: str) -> list[dict]:
        await self.service(service_id)
        if service_id not in self._staff:
            self._staff[service_id] = await self.backend.get(
                "/api/v1/portal/staff", {"service_id": service_id}
            )
        return self._staff[service_id]

    async def staff_member(self, service_id: str, staff_id: str) -> dict:
        for member in await self.staff_for(service_id):
            if member["id"] == staff_id:
                return member
        raise ToolError(
            "Unknown staff_id for this service. Call list_staff and use an id from its result."
        )

    async def appointments(self) -> list[dict]:
        if self._appointments is None:
            self._appointments = await self.backend.get("/api/v1/portal/appointments/upcoming")
        return self._appointments

    async def appointment(self, appointment_id: str) -> dict:
        for appt in await self.appointments():
            if appt["id"] == appointment_id:
                return appt
        raise ToolError(
            "Unknown appointment_id. Call list_my_appointments and use an id from its result."
        )

    # ---- time helpers ------------------------------------------------------

    def local(self, iso: str) -> datetime:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(self.timezone)

    def label(self, iso: str) -> str:
        return self.local(iso).strftime("%A %d %B %Y, %H:%M")

    async def slots(self, service_id: str, staff_id: str, day: date_type) -> list[str]:
        """Free start times for one staff member, as UTC ISO strings."""
        data = await self.backend.get(
            "/api/v1/availability",
            {"service_id": service_id, "staff_id": staff_id, "date": day.isoformat()},
        )
        return data.get("slots", [])

    async def matching_slot(
        self, service_id: str, staff_id: str, day: date_type, at: time_type
    ) -> str | None:
        wanted = datetime.combine(day, at, tzinfo=self.timezone)
        for iso in await self.slots(service_id, staff_id, day):
            if self.local(iso) == wanted:
                return iso
        return None


# ---- tool implementations ---------------------------------------------------


async def search_policies(ctx: ToolContext, args: SearchPoliciesArgs):
    results = await asyncio.to_thread(rag.search, ctx.shop_id, args.query)
    if not results:
        return {"results": [], "note": "No policy documents matched. Say you don't have that information."}
    return {"results": results}


async def list_services(ctx: ToolContext, args: NoArgs):
    return [
        {
            "service_id": s["id"],
            "name": s["name"],
            "category": s.get("category"),
            "duration_minutes": s.get("duration_minutes"),
            "price_eur": float(s["price"]) if s.get("price") is not None else None,
        }
        for s in await ctx.services()
    ]


async def list_staff(ctx: ToolContext, args: ListStaffArgs):
    return [
        {"staff_id": m["id"], "name": m["name"], "specialty": m.get("specialty")}
        for m in await ctx.staff_for(args.service_id)
    ]


async def check_availability(ctx: ToolContext, args: CheckAvailabilityArgs):
    if args.date < datetime.now(ctx.timezone).date():
        raise ToolError("That date is in the past.")
    if args.staff_id:
        members = [await ctx.staff_member(args.service_id, args.staff_id)]
    else:
        members = await ctx.staff_for(args.service_id)
    all_slots = await asyncio.gather(
        *(ctx.slots(args.service_id, m["id"], args.date) for m in members)
    )
    return {
        "date": args.date.isoformat(),
        "staff": [
            {
                "staff_id": m["id"],
                "name": m["name"],
                "free_start_times": [ctx.local(iso).strftime("%H:%M") for iso in slots],
            }
            for m, slots in zip(members, all_slots)
        ],
    }


async def list_my_appointments(ctx: ToolContext, args: NoArgs):
    return [
        {
            "appointment_id": a["id"],
            "status": a["status"],
            "when": ctx.label(a["start_time"]),
            "services": [
                {"name": s.get("service_name"), "staff": s.get("staff_name")}
                for s in a.get("services", [])
            ],
        }
        for a in await ctx.appointments()
    ]


async def propose_booking(ctx: ToolContext, args: ProposeBookingArgs):
    service = await ctx.service(args.service_id)
    member = await ctx.staff_member(args.service_id, args.staff_id)
    iso = await ctx.matching_slot(args.service_id, args.staff_id, args.date, args.time)
    if not iso:
        raise ToolError("That time is not free. Call check_availability and offer a free time.")
    ctx.actions.append(
        {
            "type": "booking",
            "service_id": service["id"],
            "service_name": service["name"],
            "staff_id": member["id"],
            "staff_name": member["name"],
            "start_time": iso,
            "when": ctx.label(iso),
            "duration_minutes": service.get("duration_minutes"),
            "price": float(service["price"]) if service.get("price") is not None else None,
        }
    )
    return "A confirmation card is now shown to the client. Nothing is booked until they press Confirm."


async def propose_cancellation(ctx: ToolContext, args: ProposeCancellationArgs):
    appt = await ctx.appointment(args.appointment_id)
    services = appt.get("services", [])
    ctx.actions.append(
        {
            "type": "cancel",
            "appointment_id": appt["id"],
            "service_name": ", ".join(s.get("service_name") or "" for s in services),
            "staff_name": ", ".join(s.get("staff_name") or "" for s in services),
            "start_time": appt["start_time"],
            "when": ctx.label(appt["start_time"]),
        }
    )
    return "A confirmation card is now shown to the client. Nothing is cancelled until they press Confirm."


async def propose_reschedule(ctx: ToolContext, args: ProposeRescheduleArgs):
    appt = await ctx.appointment(args.appointment_id)
    services = appt.get("services", [])
    if len(services) != 1:
        raise ToolError(
            "This appointment has several services and cannot be rescheduled here. "
            "Ask the client to contact the spa."
        )
    current = services[0]
    staff_id = args.staff_id or current["staff_id"]
    member = await ctx.staff_member(current["service_id"], staff_id)
    iso = await ctx.matching_slot(current["service_id"], staff_id, args.date, args.time)
    if not iso:
        raise ToolError("That time is not free. Call check_availability and offer a free time.")
    ctx.actions.append(
        {
            "type": "reschedule",
            "appointment_id": appt["id"],
            "service_name": current.get("service_name"),
            "staff_id": member["id"],
            "staff_name": member["name"],
            "start_time": iso,
            "when": ctx.label(iso),
            "old_start_time": appt["start_time"],
            "old_when": ctx.label(appt["start_time"]),
        }
    )
    return "A confirmation card is now shown to the client. Nothing is changed until they press Confirm."


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    schema: dict
    args: type[_Args]
    run: Callable[[ToolContext, _Args], Awaitable]
    needs_self_booking: bool = False

    def definition(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.schema,
            "strict": True,
        }


TOOLS: list[Tool] = [
    Tool(
        "search_policies",
        "Search the spa's own policy and information documents (rules, cancellation policy, "
        "opening hours, what to bring, treatment descriptions). Use it for every question "
        "about how the spa works, and answer only from what it returns.",
        _schema({"query": {"type": "string", "description": "What to look for, in the client's words."}}),
        SearchPoliciesArgs,
        search_policies,
    ),
    Tool(
        "list_services",
        "List the services clients can book online, with their ids, durations and prices.",
        _schema({}),
        NoArgs,
        list_services,
        needs_self_booking=True,
    ),
    Tool(
        "list_staff",
        "List the staff members who can perform a given service.",
        _schema({"service_id": _STR}),
        ListStaffArgs,
        list_staff,
        needs_self_booking=True,
    ),
    Tool(
        "check_availability",
        "Free start times for a service on one date. Pass staff_id for one staff member, or "
        "null to see every eligible staff member. " + NEVER_GUESS,
        _schema({"service_id": _STR, "date": _DATE, "staff_id": _OPTIONAL_STAFF}),
        CheckAvailabilityArgs,
        check_availability,
        needs_self_booking=True,
    ),
    Tool(
        "list_my_appointments",
        "List the client's own upcoming appointments, with their ids.",
        _schema({}),
        NoArgs,
        list_my_appointments,
    ),
    Tool(
        "propose_booking",
        "Show the client a confirmation card for a new appointment. This does not book "
        "anything; the client must press Confirm. Only call it for a time that "
        "check_availability returned as free. " + NEVER_GUESS,
        _schema({"service_id": _STR, "staff_id": _STR, "date": _DATE, "time": _TIME}),
        ProposeBookingArgs,
        propose_booking,
        needs_self_booking=True,
    ),
    Tool(
        "propose_cancellation",
        "Show the client a confirmation card to cancel one of their own appointments. This "
        "does not cancel anything; the client must press Confirm.",
        _schema({"appointment_id": _STR}),
        ProposeCancellationArgs,
        propose_cancellation,
    ),
    Tool(
        "propose_reschedule",
        "Show the client a confirmation card to move one of their own appointments to a new "
        "date and time. This does not change anything; the client must press Confirm. Pass "
        "staff_id null to keep the same staff member. " + NEVER_GUESS,
        _schema(
            {"appointment_id": _STR, "date": _DATE, "time": _TIME, "staff_id": _OPTIONAL_STAFF}
        ),
        ProposeRescheduleArgs,
        propose_reschedule,
        needs_self_booking=True,
    ),
]


def available_tools(self_booking_enabled: bool) -> list[Tool]:
    return [t for t in TOOLS if self_booking_enabled or not t.needs_self_booking]


async def run_tool(ctx: ToolContext, name: str, raw_input) -> tuple[str | list | dict, bool]:
    """Runs one tool call. Returns (result, is_error)."""
    tool = next(
        (t for t in available_tools(ctx.self_booking_enabled) if t.name.lower() == name.lower()),
        None,
    )
    if tool is None:
        return f"Unknown tool: {name}", True
    try:
        args = tool.args.model_validate(raw_input)
    except ValidationError as err:
        return f"Invalid arguments: {err.errors(include_url=False, include_input=False)}", True
    try:
        return await tool.run(ctx, args), False
    except ToolError as err:
        return str(err), True
    except BackendError as err:
        if err.code == "self_booking_disabled":
            return "Online booking is switched off for this spa. Ask the client to contact the spa.", True
        return f"The spa's system could not answer ({err.status}). Tell the client to try again later.", True
