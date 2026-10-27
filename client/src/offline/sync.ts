// Replays queued offline writes to the server, in the order they were made.
// Pure logic with its storage and network passed in, so it can be tested
// without a browser (see tests/offline/*.test.ts).
import type { QueuedWrite } from "./db";
import { findTempIds, readPath, substituteIds } from "./tempIds";

export type SendResult = { status: number; data: any } | { networkError: true };

export interface SyncDeps {
  getWrites(): Promise<QueuedWrite[]>;
  updateWrite(w: QueuedWrite): Promise<unknown>;
  removeWrite(id: string): Promise<void>;
  getIdMap(): Promise<Record<string, string>>;
  saveIdMapping(tempId: string, realId: string): Promise<unknown>;
  /** Sends one write; must use write.id as the Idempotency-Key. */
  send(w: QueuedWrite): Promise<SendResult>;
  /** The shop of the session that is logged in now (null when logged out). */
  currentShopId(): string | null;
}

export interface FlushResult {
  synced: number;
  conflicts: number;
  held: number;
  /** Why the run stopped early, if it did: unreachable server, server error, or expired session. */
  stoppedBy: "network" | "server" | "auth" | null;
}

/**
 * One sync run. Stops at the first write the server can't take right now
 * (no network, a server error, an expired session): everything after it
 * waits, so writes are never applied out of order. A write the server
 * refused (4xx) becomes a conflict for staff to resolve, and the run goes on;
 * writes that depend on a record whose create is in conflict are flagged too.
 */
export async function flush(deps: SyncDeps): Promise<FlushResult> {
  const result: FlushResult = { synced: 0, conflicts: 0, held: 0, stoppedBy: null };
  const shopId = deps.currentShopId();
  if (!shopId) {
    result.stoppedBy = "auth";
    return result;
  }
  const writes = await deps.getWrites();
  const idMap = await deps.getIdMap();
  // Temporary ids whose create can't reach the server in this run (in
  // conflict, or held for another account): writes using them can't go yet.
  const blocked = new Set<string>();
  // Creates still in the queue: a write referring to one of them waits for it
  // (stays pending) rather than being flagged, even if it got ahead of it.
  const queuedCreates = new Set(writes.filter((w) => w.tempId).map((w) => w.tempId as string));

  for (const original of writes) {
    if (original.status === "conflict") {
      if (original.tempId) blocked.add(original.tempId);
      continue;
    }
    if (original.shopId && original.shopId !== shopId) {
      // Made in another shop's session: never sent with this one.
      result.held++;
      if (original.tempId) blocked.add(original.tempId);
      continue;
    }

    const resolved = substituteIds(original.endpoint, original.body, idMap);
    const write: QueuedWrite = { ...original, endpoint: resolved.endpoint, body: resolved.body };
    const unresolved = findTempIds(write.endpoint, write.body).filter((t) => t !== original.tempId);

    if (unresolved.some((t) => blocked.has(t))) {
      // Its record (e.g. the booking a payment is for) couldn't be created.
      await deps.updateWrite({
        ...write,
        status: "conflict",
        conflict: { code: "depends_on_conflict", details: { waiting_for: unresolved } },
        lastError: "depends_on_conflict",
      });
      result.conflicts++;
      if (original.tempId) blocked.add(original.tempId);
      continue;
    }
    if (unresolved.length > 0 && unresolved.every((t) => queuedCreates.has(t))) {
      // Its record's create hasn't been sent yet: wait for the next run.
      if (original.tempId) blocked.add(original.tempId);
      continue;
    }
    if (unresolved.length > 0) {
      // Refers to a record created offline that is not in the queue any more
      // (discarded): nothing to attach it to.
      await deps.updateWrite({
        ...write,
        status: "conflict",
        conflict: { code: "missing_record", details: { waiting_for: unresolved } },
        lastError: "missing_record",
      });
      result.conflicts++;
      if (original.tempId) blocked.add(original.tempId);
      continue;
    }

    const sent = await deps.send(write);
    if ("networkError" in sent) {
      result.stoppedBy = "network";
      break;
    }
    const { status, data } = sent;

    if (status >= 200 && status < 300) {
      if (original.tempId) {
        queuedCreates.delete(original.tempId);
        const realId = readPath(data, original.resultIdPath || "id");
        if (realId) {
          await deps.saveIdMapping(original.tempId, String(realId));
          idMap[original.tempId] = String(realId);
        }
      }
      await deps.removeWrite(original.id);
      result.synced++;
      continue;
    }
    if (status === 404 && write.method === "DELETE") {
      // Already gone: the outcome the delete wanted.
      await deps.removeWrite(original.id);
      result.synced++;
      continue;
    }
    if (status === 401) {
      // Session expired while offline: keep everything as is and wait for
      // the next login, rather than turning the queue into conflicts.
      result.stoppedBy = "auth";
      break;
    }
    if (status >= 400 && status < 500) {
      // Saved with ids already swapped to real ones, so a retry ("keep mine")
      // doesn't depend on the mapping again.
      await deps.updateWrite({
        ...write,
        status: "conflict",
        conflict: { code: data?.error || `http_${status}`, details: data },
        lastError: data?.error || `Request failed (${status})`,
      });
      result.conflicts++;
      if (original.tempId) blocked.add(original.tempId);
      continue;
    }
    // 5xx: the server is up but failing — try again later, in order.
    result.stoppedBy = "server";
    break;
  }
  return result;
}

/** "Keep mine": send the write again, telling the server to overwrite / book anyway. */
export const keepMine = (w: QueuedWrite): QueuedWrite => ({
  ...w,
  status: "pending",
  conflict: undefined,
  lastError: undefined,
  body: w.body && typeof w.body === "object" ? { ...w.body, force: true } : w.body,
});

/**
 * "Cancel instead" for a delete the server refused because the booking has
 * payments: the same write becomes a cancellation of that booking (kept,
 * marked cancelled, payments stay as the client's credit).
 */
export const cancelInstead = (w: QueuedWrite): QueuedWrite => ({
  ...w,
  method: "POST",
  endpoint: w.endpoint.replace(/\?.*$/, "") + "/cancel",
  body: {},
  kind: "appointment",
  status: "pending",
  conflict: undefined,
  lastError: undefined,
});
export const canCancelInstead = (w: QueuedWrite) => w.method === "DELETE" && w.conflict?.code === "has_payments";

/** Conflicts that "keep mine" can resolve (the others can only be discarded). */
export const canKeepMine = (w: QueuedWrite) =>
  ["slot_taken", "stale_appointment"].includes(w.conflict?.code || "");
