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

// A file upload: the form data is sent as is (the browser sets its own
// multipart Content-Type), the JSON answer parsed like any other.
async function upload<T = any>(url: string, form: FormData, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: authHeaders(), body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

// A file from the API, with the login in the header (never ?token= in the
// link, which ends up in logs and browser history).
async function blob(url: string): Promise<Blob> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.blob();
}

export const api = {
  get: <T = any>(url: string, init?: RequestInit) => request<T>("GET", url, undefined, init),
  post: <T = any>(url: string, body?: unknown, init?: RequestInit) => request<T>("POST", url, body, init),
  put: <T = any>(url: string, body?: unknown, init?: RequestInit) => request<T>("PUT", url, body, init),
  patch: <T = any>(url: string, body?: unknown, init?: RequestInit) => request<T>("PATCH", url, body, init),
  del: <T = any>(url: string, init?: RequestInit) => request<T>("DELETE", url, undefined, init),
  /** Any method, e.g. for a screen's own small `call(url, method, body)` helper. */
  request: <T = any>(method: string, url: string, body?: unknown, init?: RequestInit) => request<T>(method, url, body, init),
  upload,
  blob,
};

/**
 * For screens that show their own error text: a refused request becomes
 * Error(the server's `error`, else `fallback`); a network failure is passed
 * on as is. Use as `.catch(withMessage(t("…")))`.
 */
export const withMessage =
  (fallback: string) =>
  (err: unknown): never => {
    if (err instanceof ApiError) throw new Error(err.data?.error || fallback);
    throw err;
  };

/**
 * For a request whose refusal a screen quietly ignores (it keeps what it
 * had): a refused request answers `fallback`; a network failure is passed on.
 * Use as `.catch(ifRefused(current))`.
 */
export const ifRefused =
  <T>(fallback: T) =>
  (err: unknown): T => {
    if (err instanceof ApiError) return fallback;
    throw err;
  };

/** Saves `data` as a file called `filename` (a download). */
export const saveBlob = (data: Blob, filename: string) => {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Opens an API file (a PDF, an image) in a new tab, logged in. */
export const openBlob = async (url: string) => {
  // Opened first, while still in the click, so pop-up blockers allow it.
  const win = window.open("", "_blank");
  try {
    const data = await blob(url);
    const objectUrl = URL.createObjectURL(data);
    if (win) win.location.href = objectUrl;
    else window.location.href = objectUrl;
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (err) {
    win?.close();
    throw err;
  }
};
