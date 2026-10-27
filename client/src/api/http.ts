// One way to call the app's own API: the login token is added, the JSON
// answer is parsed, and a refused request throws ApiError with the status and
// the server's body (e.g. { error: "walk_in_locked" }). An expired session is
// still handled by sessionRecovery.ts (it watches every fetch).
//
// Writes that must survive a lost connection go through fetchOrQueue
// (offline/queue.ts) instead.

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: any,
  ) {
    super(data?.error || `HTTP ${status}`);
  }
}

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function request<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T = any>(url: string, init?: RequestInit) => request<T>("GET", url, undefined, init),
  post: <T = any>(url: string, body?: unknown, init?: RequestInit) => request<T>("POST", url, body, init),
  put: <T = any>(url: string, body?: unknown, init?: RequestInit) => request<T>("PUT", url, body, init),
  del: <T = any>(url: string, init?: RequestInit) => request<T>("DELETE", url, undefined, init),
};
