import { ref } from "vue";

// Module-scoped (not per-component) so the captured event survives regardless
// of which component happens to be mounted when the browser fires it — Chrome
// can fire beforeinstallprompt before the client portal is ever visited.
let deferredPrompt: any = null;
const canInstall = ref(false);

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (window.navigator as any).standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !(window as any).MSStream;

// Brave deliberately never fires beforeinstallprompt (fewer background
// install signals, part of its privacy stance) even when the manifest and
// service worker are otherwise fully valid — so "ready" will never happen
// there and it needs the same manual-instructions treatment as iOS. Brave
// exposes navigator.brave.isBrave() specifically because its UA string
// masks itself as Chrome, so UA sniffing can't detect it.
const isBrave = ref(false);
(async () => {
  try {
    isBrave.value = !!(await (navigator as any).brave?.isBrave?.());
  } catch {}
})();

window.addEventListener("beforeinstallprompt", (e: Event) => {
  e.preventDefault();
  deferredPrompt = e;
  canInstall.value = true;
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  canInstall.value = false;
});

// A single status the UI can switch on, so "no button" is never the only
// signal — every case has something to show, including why it can't install.
export type PwaInstallStatus =
  | "installed" // already running standalone — nothing to offer
  | "manual" // iOS or Brave: no beforeinstallprompt ever fires; show manual steps
  | "ready" // beforeinstallprompt fired — a real native install prompt is available
  | "insecure-context" // needs https/localhost — the browser won't ever offer install here
  | "not-yet-eligible"; // secure + supported browser, but Chrome hasn't decided to offer it yet — often just needs one page reload once the service worker has fully registered

export function usePwaInstall() {
  const promptInstall = async () => {
    if (!deferredPrompt) return null;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    canInstall.value = false;
    return choice.outcome as "accepted" | "dismissed";
  };

  const standalone = isStandalone();
  const ios = isIOS();
  const secure = window.isSecureContext;

  const status = (): PwaInstallStatus => {
    if (standalone) return "installed";
    if (ios || isBrave.value) return "manual";
    if (canInstall.value) return "ready";
    if (!secure) return "insecure-context";
    return "not-yet-eligible";
  };

  return {
    canInstall,
    promptInstall,
    isIOS: ios,
    isBrave,
    isStandalone: standalone,
    isSecureContext: secure,
    status,
  };
}
