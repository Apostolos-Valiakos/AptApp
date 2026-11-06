// What the requirement tests share: a stand-in for the server at the network
// boundary, a saved login, and a screen mounted as the real app mounts it
// (PrimeVue, Pinia, translations, toasts and confirmations all real).
import { defineComponent, h, type Component } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { getActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import Tooltip from "primevue/tooltip";
import { vi } from "vitest";
import { i18n } from "../../client/src/i18n";

export type Reply = { status?: number; body?: any } | "network-down" | Promise<any>;
export type Handler = Reply | ((url: string, init: RequestInit) => Reply);
export type Call = { method: string; url: string; path: string; body: any; token: string | null };

const toResponse = ({ status = 200, body = [] }: { status?: number; body?: any }) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Replaces fetch. `routes` are keyed "METHOD /path" (the query string is
 * ignored); anything else answers 200 with an empty list.
 */
export const fakeServer = (routes: Record<string, Handler> = {}) => {
  const calls: Call[] = [];
  const server = {
    routes,
    calls,
    called: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path),
  };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const path = url.split("?")[0];
    const method = init.method || "GET";
    const auth = new Headers(init.headers).get("Authorization");
    calls.push({
      method,
      url,
      path,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      token: auth?.startsWith("Bearer ") ? auth.slice(7) : null,
    });
    const handler = server.routes[`${method} ${path}`];
    const reply = typeof handler === "function" ? handler(url, init) : handler;
    const settled = await (reply ?? {});
    if (settled === "network-down") throw new TypeError("Failed to fetch");
    return toResponse(settled);
  });
  return server;
};

/** A promise a test settles by hand: controls when the server "answers". */
export const deferred = <T = any>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

/** A login saved in the browser, as a page reload would find it. */
export const saveLogin = (user: Record<string, any>, token = `token-${user.role}`) => {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
};

export const setBrowserOnline = (online: boolean) =>
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);

/** A router with the given screen at /login; every other path is a blank page. */
export const blankRouter = (routes: { path: string; component: Component }[] = []) =>
  createRouter({
    history: createMemoryHistory(),
    routes: [...routes, { path: "/:rest(.*)*", component: { render: () => h("div") } }],
  });

export const mountScreen = (screen: Component, options: { router?: Router; props?: any; stubs?: Record<string, any> } = {}) => {
  const router = options.router ?? blankRouter();
  const Host = defineComponent({
    render: () => [h(Toast), h(ConfirmDialog), h(screen, options.props)],
  });
  return mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [getActivePinia()!, i18n, router, [PrimeVue, { theme: "none" }], ToastService, ConfirmationService],
      directives: { tooltip: Tooltip },
      stubs: options.stubs,
    },
  });
};

export const settle = async () => {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
};

/** All the text on the page, toasts and dialogs (teleported to <body>) included. */
export const pageText = () => document.body.textContent || "";

export const errorToasts = () => document.querySelectorAll(".p-toast-message-error").length;

/** Answers the open confirmation; fails if none is open. */
export const answerConfirm = async (accept: boolean) => {
  await vi.waitFor(() => {
    if (!document.querySelector(".p-confirmdialog")) throw new Error("no confirmation is open");
  });
  const button = document.querySelector<HTMLButtonElement>(
    accept ? ".p-confirmdialog-accept-button" : ".p-confirmdialog-reject-button",
  );
  button!.click();
  await settle();
};
