import type { Router } from "vue-router";
import { useAuthStore } from "../stores/auth";

// Recovers from two situations that used to leave a blank page until the user
// logged out and back in, or refreshed:
//
// 1. An expired or revoked session. The app treats "a token is saved" as
//    logged in, so after the token expires every API call is refused while the
//    pages stay open and empty. The server answers 401 for a bad session; on
//    the first such answer to a request made with the current token, log out
//    and show the login page with a "session expired" message.
//
// 2. A rebuild while a tab is open. Pages are loaded on demand from hashed
//    build files, which a rebuild replaces; loading one that no longer exists
//    fails. Reload once at the page being opened to pick up the new build.

const requestPath = (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return url.replace(/^https?:\/\/[^/]+/, "");
};

// The token a request was sent with (the Authorization header; the server
// no longer takes one in the URL).
const sentToken = (input: RequestInfo | URL, init?: RequestInit): string | null => {
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const auth = headers.get("Authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
};

const RELOAD_KEY = "chunkReloadAt";

export const installSessionRecovery = (router: Router) => {
  const authStore = useAuthStore();
  const originalFetch = window.fetch.bind(window);
  let redirecting = false;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init);
    if (res.status === 401 && !redirecting && authStore.isAuthenticated) {
      const path = requestPath(input);
      const token = sentToken(input, init);
      // Only a refusal of the session in use right now: not a wrong password
      // at login, and not a late answer to a request made with an older token.
      if (path.startsWith("/api") && !path.includes("/login") && token && token === authStore.token) {
        redirecting = true;
        authStore.logout();
        router
          .replace({ path: "/login", query: { expired: "1" } })
          .finally(() => {
            redirecting = false;
          });
      }
    }
    return res;
  };

  const isStaleBuildError = (err: unknown) =>
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
      String((err as any)?.message || err),
    );

  // At most one automatic reload per 30 s, so a real outage can't loop.
  const reloadOnce = (targetPath?: string) => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    } catch {
      // storage unavailable: still reload once
    }
    if (Date.now() - last < 30000) return false;
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    window.location.assign(targetPath || window.location.href);
    return true;
  };

  // While the router is opening a page, its own error hook below reloads at
  // that page; Vite's preload event would reload at the current one instead.
  let pendingNavigation: string | null = null;
  router.beforeEach((to) => {
    pendingNavigation = to.fullPath;
  });
  router.afterEach(() => {
    pendingNavigation = null;
  });

  // Vite reports a failed preload of build files here (any lazy import).
  window.addEventListener("vite:preloadError", (event) => {
    if (pendingNavigation) return;
    if (reloadOnce()) event.preventDefault();
  });

  router.onError((err, to) => {
    pendingNavigation = null;
    if (isStaleBuildError(err)) reloadOnce(to?.fullPath);
  });
};
