// An in-memory stand-in for the app's API, with the behaviour the offline
// sync relies on (mirrors server/server.js, checked by server.test.mjs):
// idempotency keys, versions and stale edits, slot conflicts, deletes,
// payments. Tests can cut the network, lose responses, fail with 5xx or
// expire the session at any point.
import type { QueuedWrite } from "../../client/src/offline/db";
import type { SendResult } from "../../client/src/offline/sync";

export class FakeServer {
  appointments = new Map<string, any>();
  clients = new Map<string, any>();
  transactions: any[] = [];
  requests: { method: string; endpoint: string; key?: string; body: any }[] = [];
  /** Slots ("staffId|start") already booked online by someone else. */
  takenSlots = new Set<string>();
  offline = false;
  sessionExpired = false;
  /** Fail the next N requests with a 500. */
  fail5xx = 0;
  /** Apply the next N writes but lose the response (network drops after). */
  loseResponses = 0;
  private replies = new Map<string, { status: number; data: any }>();
  private seq = 0;

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}-${String(this.seq).padStart(4, "0")}-0000-0000-0000-000000000000`.slice(0, 36);
  }

  /** Book something online directly (another device, while this one is offline). */
  bookOnline(staffId: string, start: string) {
    const id = this.nextId("aaaaaaaa");
    this.appointments.set(id, { id, version: 1, services: [{ staff_id: staffId, start_time: start }] });
    this.takenSlots.add(`${staffId}|${new Date(start).toISOString()}`);
    return id;
  }
  /** Edit an appointment online (raises its version). */
  editOnline(id: string, changes: any = {}) {
    const a = this.appointments.get(id);
    Object.assign(a, changes, { version: a.version + 1 });
  }

  handle(method: string, endpoint: string, body: any, key?: string): SendResult {
    if (this.offline) return { networkError: true };
    this.requests.push({ method, endpoint, key, body });
    if (this.sessionExpired) return { status: 401, data: { error: "invalid_token" } };
    if (this.fail5xx > 0) {
      this.fail5xx--;
      return { status: 500, data: { error: "Internal server error" } };
    }
    if (key && this.replies.has(key)) return this.reply(this.replies.get(key)!);

    const out = this.route(method, endpoint, body);
    if (key && out.status < 400) this.replies.set(key, out);
    return this.reply(out);
  }

  private reply(out: { status: number; data: any }): SendResult {
    if (this.loseResponses > 0) {
      this.loseResponses--;
      return { networkError: true };
    }
    return out;
  }

  private route(method: string, endpoint: string, body: any): { status: number; data: any } {
    const path = endpoint.split("?")[0];
    const refs = JSON.stringify(body ?? {}) + path;
    if (/tmp-/.test(refs)) return { status: 422, data: { error: "temporary_id_sent_to_server" } };

    if (method === "POST" && path === "/api/v1/clients") {
      const id = this.nextId("cccccccc");
      this.clients.set(id, { id, ...body });
      return { status: 200, data: { success: true, client: { id, ...body } } };
    }
    if (method === "POST" && path === "/api/v1/appointments") {
      if (body.client_id && !this.clients.has(body.client_id) && !String(body.client_id).startsWith("known-")) {
        return { status: 422, data: { error: "unknown_client" } };
      }
      if (Array.isArray(body.offline_known_overlaps) && !body.force) {
        const clash = (body.services || []).find((s: any) =>
          this.takenSlots.has(`${s.staff_id}|${new Date(s.start_time).toISOString()}`),
        );
        if (clash) return { status: 409, data: { error: "slot_taken", conflicts: [{ start_time: clash.start_time }] } };
      }
      const id = this.nextId("bbbbbbbb");
      this.appointments.set(id, { id, version: 1, ...body });
      return { status: 200, data: { id, version: 1, success: true } };
    }
    const m = path.match(/^\/api\/v1\/appointments\/([^/]+)$/);
    if (m && method === "PUT") {
      const a = this.appointments.get(m[1]);
      if (!a) return { status: 409, data: { error: "appointment_missing" } };
      if (body.base_version != null && !body.force && body.base_version !== a.version) {
        return { status: 409, data: { error: "stale_appointment", current_version: a.version } };
      }
      Object.assign(a, body, { version: a.version + 1 });
      return { status: 200, data: { success: true, version: a.version } };
    }
    if (m && method === "DELETE") {
      if (!this.appointments.has(m[1])) return { status: 200, data: { success: true, already_deleted: true } };
      this.appointments.delete(m[1]);
      return { status: 200, data: { success: true } };
    }
    if (method === "POST" && path === "/api/v1/transactions") {
      const ids = body.appointment_ids?.length ? body.appointment_ids : [body.appointment_id];
      if (ids.some((id: string) => !this.appointments.has(id))) return { status: 404, data: { error: "Appointment not found" } };
      this.transactions.push({ ...body });
      for (const id of ids) this.appointments.get(id).version += 1;
      return { status: 200, data: { success: true } };
    }
    return { status: 404, data: { error: "not_found" } };
  }

  /** SyncDeps.send for the engine tests. */
  send = async (w: QueuedWrite): Promise<SendResult> => this.handle(w.method, w.endpoint, w.body, w.id);

  /** A fetch() for the queue tests (same behaviour over Request/Response). */
  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    if (url === "/health") {
      if (this.offline) throw new TypeError("Failed to fetch");
      return new Response("{}", { status: 200 });
    }
    const headers = (init.headers || {}) as Record<string, string>;
    const out = this.handle(init.method || "GET", url, init.body ? JSON.parse(String(init.body)) : undefined, headers["Idempotency-Key"]);
    if ("networkError" in out) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(out.data), { status: out.status, headers: { "Content-Type": "application/json" } });
  };
}
