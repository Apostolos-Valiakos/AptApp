// Temporary ids for records created offline (appointments, clients). The
// rest of the queue and the calendar refer to them until the create syncs and
// the server assigns the real id; every later write is then rewritten.

export const TEMP_PREFIX = "tmp-";

export const newTempId = () =>
  TEMP_PREFIX + (typeof globalThis.crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const isTempId = (v: unknown): v is string => typeof v === "string" && v.startsWith(TEMP_PREFIX);

const TEMP_RE = /tmp-[0-9a-f-]{8,}/gi;

/** Every temporary id mentioned in an endpoint and a body. */
export const findTempIds = (endpoint: string, body: unknown): string[] => {
  const text = `${endpoint} ${body === undefined ? "" : JSON.stringify(body)}`;
  return [...new Set(text.match(TEMP_RE) || [])];
};

/** Replaces temporary ids that now have a real id, in an endpoint and a body. */
export const substituteIds = <T>(endpoint: string, body: T, map: Record<string, string>): { endpoint: string; body: T } => {
  const swap = (s: string) => s.replace(TEMP_RE, (m) => map[m] || m);
  return {
    endpoint: swap(endpoint),
    body: body === undefined || body === null ? body : (JSON.parse(swap(JSON.stringify(body))) as T),
  };
};

/** Reads "id" or "client.id" style paths from a response. */
export const readPath = (obj: any, path: string): any =>
  path.split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
