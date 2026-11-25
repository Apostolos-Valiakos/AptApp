// In the Android app (Capacitor) there is no server behind the page: it runs
// from https://localhost, so a relative "/api/..." would ask the phone itself.
// When VITE_API_BASE_URL is set at build time (client/.env.portal), requests
// to the server's paths go to that address instead. The web build leaves it
// empty and nothing changes. Shared by both entries (main.ts, portal/main.ts).

// The server's paths: the API, the assistant (it streams from /ai/chat), the
// live updates and the health check. Anything else (the app's own files,
// fonts, other sites) is left alone.
export const API_PREFIXES = ["/api", "/ai", "/socket.io", "/health"];

const isServerPath = (path: string) =>
  API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));

/** The address to ask for `input`: the server's paths prefixed with `base`. */
export const withApiBase = (input: RequestInfo | URL, base: string): RequestInfo | URL => {
  const root = base.replace(/\/+$/, "");
  return root && typeof input === "string" && isServerPath(input) ? root + input : input;
};

/** Patches fetch once, when a base is set (the app build); a no-op on the web. */
export const installApiBase = (base: string = (import.meta.env.VITE_API_BASE_URL as string) ?? "", target: Window = window) => {
  if (!base) return;
  const original = target.fetch.bind(target);
  target.fetch = (input: RequestInfo | URL, init?: RequestInit) => original(withApiBase(input, base), init);
};
