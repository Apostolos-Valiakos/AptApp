// The 3D stage (three.js, the page's largest script) is loaded separately,
// once the page is showing — see loadStage.
import type { Rect, Stage } from "./webgl/stage";

const clamp = (x: number, a = 0, b = 1) => Math.min(Math.max(x, a), b);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** One wheel notch travels further while walking through the spa, so the journey never drags. */
const JOURNEY_WHEEL_BOOST = 2.4;
const JOURNEY_TOUCH_BOOST = 1.6;
const ZOOM_SCREENS = 1.1;

interface Tracked {
  element: HTMLElement;
  top: number;
  height: number;
}

/**
 * Drives the page imperatively: a virtual scroll moves the page container, and
 * every scroll-linked layer (hero stones, film frame, spa journey, pinned
 * closing section) reads the same eased position.
 */
export class PureController {
  private html = document.documentElement;
  private $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    this.root.querySelector<T>(selector)!;
  private inner: HTMLElement;
  private canvas: HTMLCanvasElement;
  private stage: Stage | null = null;
  private disposed = false;
  private abort = new AbortController();
  private observer: ResizeObserver;
  private frame = 0;
  private lastTime = 0;
  private time = 0;
  private needsResize = false;

  private width = 1;
  private height = 1;
  private scroll = 0;
  private target = 0;
  private maxScroll = 0;
  private overscroll = 0;
  private touchY = 0;
  private touchVelocity = 0;
  private touching = false;
  private calledAt = -10;

  private ready = false;
  private menuOpen = false;
  private overlayOpen = false;
  private pointer = { x: -1, y: -1 };

  private metrics = {
    hero: { x: 0, y: 0, width: 0, height: 0 },
    heroBottom: 0,
    reelTop: 0,
    thumb: { x: 0, y: 0, width: 0, height: 0 },
    reel: { x: 0, y: 0, width: 0, height: 0 },
    reelPin: 0,
    door: { x: 0, y: 0, width: 0, height: 0 },
    zoomStart: 0,
    zoomEnd: 0,
    endTop: 0,
    endHeight: 0,
    footerTop: 0,
    radius: 20,
  };
  private reveals: Tracked[] = [];
  private clips: Tracked[] = [];
  private scenes: HTMLElement[];
  private captions: HTMLElement[];

  constructor(private root: HTMLElement) {
    this.inner = this.$("#page-container-inner");
    this.canvas = this.$<HTMLCanvasElement>("#canvas");
    this.scenes = [...root.querySelectorAll<HTMLElement>(".journey-scene")];
    this.captions = [...root.querySelectorAll<HTMLElement>(".journey-caption")];
    this.html.classList.add("is-white-bg");

    this.bindEvents();
    this.resize();
    // Language switches, the price-list accordion and late fonts all change the page height.
    this.observer = new ResizeObserver(() => (this.needsResize = true));
    this.observer.observe(this.inner);
    this.frame = requestAnimationFrame(this.tick);
    void this.loadStage();
  }

  /**
   * Loads the 3D hero after the page is up, so its code doesn't hold back the
   * first paint; until then (or without WebGL) the hero frame is a plain warm
   * panel and the rest of the page works as normal.
   */
  private async loadStage() {
    try {
      const { Stage } = await import("./webgl/stage");
      if (this.disposed) return;
      this.stage = new Stage(this.canvas);
      this.stage.resize(this.width, this.height);
    } catch {
      this.stage = null;
      this.canvas.style.display = "none";
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.observer.disconnect();
    this.stage?.dispose();
    this.html.classList.remove("is-ready", "is-white-bg", "is-black-bg", "is-desktop", "is-mobile");
  }

  // --- input -------------------------------------------------------------

  private bindEvents() {
    const { signal } = this.abort;
    const on = <K extends keyof WindowEventMap>(
      type: K,
      handler: (event: WindowEventMap[K]) => void,
      options: AddEventListenerOptions = {},
    ) => window.addEventListener(type, handler, { signal, ...options });

    on("resize", () => this.resize());
    on("wheel", (event) => {
      event.preventDefault();
      if (this.overlayOpen || !this.ready) return;
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? this.height : 1;
      this.scrollBy(event.deltaY * unit * (this.inJourney() ? JOURNEY_WHEEL_BOOST : 1));
    }, { passive: false });

    on("touchstart", (event) => {
      this.touching = true;
      this.touchVelocity = 0;
      this.touchY = event.touches[0].clientY;
    }, { passive: true });
    on("touchmove", (event) => {
      if (this.overlayOpen || !this.ready) return;
      const y = event.touches[0].clientY;
      const delta = (this.touchY - y) * (this.inJourney() ? JOURNEY_TOUCH_BOOST : 1);
      this.touchY = y;
      this.touchVelocity = mix(this.touchVelocity, delta * 0.6, 0.5);
      this.scrollBy(delta);
      this.scroll = mix(this.scroll, this.target, 0.6);
    }, { passive: true });
    on("touchend", () => (this.touching = false), { passive: true });

    on("keydown", (event) => {
      if (event.key === "Escape") {
        if (this.overlayOpen) this.closeFilm();
        else if (this.menuOpen) this.toggleMenu(false);
        return;
      }
      if (this.overlayOpen) return;
      const page = this.height * 0.9;
      const steps: Record<string, number> = {
        ArrowDown: 120, ArrowUp: -120, PageDown: page, PageUp: -page, " ": event.shiftKey ? -page : page,
      };
      if (event.key in steps) {
        if (event.key === " " && event.target instanceof HTMLElement && event.target.closest("button, a, summary")) return;
        event.preventDefault();
        this.scrollBy(steps[event.key] * (this.inJourney() ? JOURNEY_WHEEL_BOOST : 1));
      } else if (event.key === "Home") this.target = 0;
      else if (event.key === "End") this.target = this.maxScroll;
    });

    on("pointermove", (event) => {
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
    });

    this.$("#header-right-menu-btn").addEventListener("click", () => this.toggleMenu(), { signal });
    this.$("#header-background").addEventListener("click", () => this.toggleMenu(false), { signal });
    this.root.querySelectorAll<HTMLElement>("[data-scroll-to]").forEach((element) => {
      element.addEventListener("click", () => {
        this.toggleMenu(false);
        this.scrollToId(element.dataset.scrollTo!);
      }, { signal });
    });
    this.$("#home-reel-video-watch-btn").addEventListener("click", () => this.openFilm(), { signal });
    this.$("#video-overlay").addEventListener("click", (event) => {
      if (!(event.target instanceof HTMLVideoElement)) this.closeFilm();
    }, { signal });
  }

  private scrollBy(delta: number) {
    const next = this.target + delta;
    if (next > this.maxScroll && this.scroll > this.maxScroll - 4) this.overscroll += next - this.maxScroll;
    this.target = clamp(next, 0, this.maxScroll);
  }

  private scrollToId(id: string) {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!element) return;
    const offset = element.classList.contains("section") ? 0 : this.height * 0.14;
    this.target = clamp(this.pageRect(element).y - offset, 0, this.maxScroll);
  }

  private inJourney() {
    const m = this.metrics;
    return this.scroll > m.zoomEnd && this.scroll < m.endTop - this.height * 0.5;
  }

  private toggleMenu(open = !this.menuOpen) {
    this.menuOpen = open;
    for (const id of ["#header-menu", "#header-right-menu-btn", "#header-background"]) {
      this.$(id).classList.toggle("--opened", open);
    }
    this.$("#header").classList.toggle("--menu-opened", open);
  }

  private openFilm() {
    this.$("#video-overlay").classList.add("--opened");
    this.overlayOpen = true;
    const video = this.$<HTMLVideoElement>("#video-overlay-video");
    video.currentTime = 0;
    video.play().catch(() => undefined);
  }

  private closeFilm() {
    this.$("#video-overlay").classList.remove("--opened");
    this.$<HTMLVideoElement>("#video-overlay-video").pause();
    this.overlayOpen = false;
  }

  // --- layout ------------------------------------------------------------

  /** Element box in page coordinates (unaffected by the scroll transform). */
  private pageRect(element: HTMLElement): Rect {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = element;
    while (node && node !== this.inner) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return { x, y, width: element.offsetWidth, height: element.offsetHeight };
  }

  private resize() {
    this.needsResize = false;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.html.style.setProperty("--vh", `${this.height * 0.01}px`);
    const mobile = this.width <= 812;
    this.html.classList.toggle("is-mobile", mobile);
    this.html.classList.toggle("is-desktop", !mobile);
    this.stage?.resize(this.width, this.height);

    // Clear pin offsets before measuring.
    this.$("#home-reel-video-container").style.transform = "";
    this.$("#end-section-outer").style.transform = "";

    const m = this.metrics;
    m.radius = parseFloat(getComputedStyle(this.html).getPropertyValue("--global-border-radius")) || 20;
    m.hero = this.pageRect(this.$("#home-hero-visual-container"));
    m.heroBottom = this.$("#home-hero").offsetHeight;
    m.reelTop = this.pageRect(this.$("#home-reel")).y;
    m.thumb = this.pageRect(this.$("#home-reel-thumb"));
    m.reel = this.pageRect(this.$("#home-reel-video-container"));
    m.reelPin = mobile ? 0 : this.height;
    m.door = this.pageRect(this.$("#home-goal-image-in"));
    m.zoomStart = m.door.y + m.door.height / 2 - this.height / 2;
    m.zoomEnd = m.zoomStart + this.height * ZOOM_SCREENS;
    const end = this.pageRect(this.$("#end-section"));
    m.endTop = end.y;
    m.endHeight = end.height;
    m.footerTop = this.pageRect(this.$("#footer-section")).y;
    this.maxScroll = Math.max(this.inner.offsetHeight - this.height, 0);
    this.target = clamp(this.target, 0, this.maxScroll);

    this.reveals = [...this.root.querySelectorAll<HTMLElement>(".lu-rise, .lu-fade")].map((element) => {
      const rect = this.pageRect(element.classList.contains("lu-rise") ? element.parentElement! : element);
      return { element, top: rect.y, height: rect.height };
    });
    this.clips = [...this.root.querySelectorAll<HTMLElement>(".project-item-clip")].map((element) => {
      const rect = this.pageRect(element.parentElement!);
      return { element, top: rect.y, height: rect.height };
    });
  }

  // --- frame -------------------------------------------------------------

  private tick = (now: number) => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min((now - (this.lastTime || now)) / 1000, 0.1);
    this.lastTime = now;
    this.time += dt;
    if (this.needsResize) this.resize();

    if (!this.ready && this.time > 1.1) {
      this.ready = true;
      this.html.classList.add("is-ready");
      const preloader = this.$("#preloader");
      preloader.classList.add("--done");
      window.setTimeout(() => preloader.remove(), 1000);
    }

    if (!this.touching && Math.abs(this.touchVelocity) > 0.2) {
      this.scrollBy(this.touchVelocity);
      this.touchVelocity *= Math.exp(-dt * 6);
    }
    this.scroll = mix(this.scroll, this.target, 1 - Math.exp(-dt * 7));
    if (Math.abs(this.scroll - this.target) < 0.05) this.scroll = this.target;
    const s = this.scroll;
    this.inner.style.transform = `translate3d(0, ${-s}px, 0)`;

    this.updateIndicator(s);
    this.updateReveals(s);
    this.updateFilm(s);
    this.updateHero(s, dt);
    this.updateJourney(s);
    this.updateEnd(s, dt);
  };

  private updateIndicator(s: number) {
    const total = this.maxScroll + this.height;
    const size = clamp(this.height / total, 0.04, 1);
    const progress = this.maxScroll ? s / this.maxScroll : 0;
    this.$("#scroll-indicator-bar").style.transform =
      `translate3d(0, ${progress * (1 - size) * 100}%, 0) scaleY(${size})`;
  }

  private updateReveals(s: number) {
    if (!this.ready) return;
    const line = s + this.height * 0.88;
    for (const reveal of this.reveals) {
      if (reveal.top < line) reveal.element.classList.add("is-in");
    }
    // Treatment clips only play while their card is on screen.
    for (const clip of this.clips) {
      const video = clip.element as HTMLVideoElement;
      const visible = clip.top < s + this.height * 0.9 && clip.top + clip.height > s + this.height * 0.1;
      if (visible && video.paused) {
        video.play().then(() => video.classList.add("is-playing")).catch(() => undefined);
      } else if (!visible && !video.paused) video.pause();
    }
  }

  private updateFilm(s: number) {
    const m = this.metrics;
    const frame = this.$("#home-reel-frame");
    const hasThumb = m.thumb.height > 2;
    const restY = m.reel.y - (this.height - m.reel.height) / 2;
    const t = hasThumb ? smooth(m.thumb.y - this.height * 0.55, restY, s) : 1;
    const pin = clamp(s - restY, 0, m.reelPin);
    this.$("#home-reel-video-container").style.transform = pin ? `translate3d(0, ${pin}px, 0)` : "";

    const from = hasThumb ? m.thumb : m.reel;
    const x = mix(from.x, m.reel.x, t);
    const y = mix(from.y, m.reel.y + pin, t) - m.reelTop;
    frame.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    frame.style.width = `${mix(from.width, m.reel.width, t)}px`;
    frame.style.height = `${mix(from.height, m.reel.height, t)}px`;
    frame.style.setProperty("--reel-open", String(smooth(0.7, 1, t)));

    const video = frame.querySelector("video")!;
    const top = m.reelTop + y - s;
    const visible = this.ready && !this.overlayOpen && top < this.height && top + m.reel.height > 0;
    if (visible && video.paused) video.play().catch(() => undefined);
    else if (!visible && !video.paused) video.pause();
  }

  private updateHero(s: number, dt: number) {
    const m = this.metrics;
    const canvas = this.canvas;
    if (!this.stage || !this.ready || s >= m.heroBottom) {
      canvas.style.visibility = "hidden";
      return;
    }
    canvas.style.visibility = "visible";
    const hero: Rect = { x: m.hero.x, y: m.hero.y - s, width: m.hero.width, height: m.hero.height };
    const right = this.width - hero.x - hero.width;
    const bottom = this.height - hero.y - hero.height;
    canvas.style.clipPath = `inset(${hero.y}px ${right}px ${bottom}px ${hero.x}px round ${m.radius}px)`;
    const inside =
      this.pointer.x >= hero.x && this.pointer.x <= hero.x + hero.width &&
      this.pointer.y >= hero.y && this.pointer.y <= hero.y + hero.height;
    this.stage.stones.setPointer(
      ((this.pointer.x - hero.x) / hero.width) * 2 - 1,
      -(((this.pointer.y - hero.y) / hero.height) * 2 - 1),
      inside,
    );
    this.stage.render(hero, dt);
  }

  /**
   * The walk through the spa. The fixed photo stack is first clipped to the
   * arched doorway in the page, opens to full screen, then each next room
   * arrives through an arch that grows from the middle of the current one.
   */
  private updateJourney(s: number) {
    const m = this.metrics;
    const { width, height } = this;
    const journey = this.$("#journey");
    const doorTop = m.door.y - Math.min(s, m.zoomStart);
    const active = doorTop < height && s < m.endTop;
    // display, not visibility: the scenes set their own visibility and would show through.
    journey.style.display = active ? "block" : "none";

    const zoom = smooth(m.zoomStart, m.zoomEnd, s);
    const dark = zoom > 0.92 && s < m.footerTop - height * 0.08;
    this.html.classList.toggle("is-black-bg", dark);
    this.html.classList.toggle("is-white-bg", !dark);
    this.$("#home-goal-context").style.opacity = String(1 - smooth(0.05, 0.45, zoom));
    if (!active) return;

    const x = mix(m.door.x, 0, zoom);
    const y = mix(doorTop, 0, zoom);
    const w = mix(m.door.width, width, zoom);
    const h = mix(m.door.height, height, zoom);
    const bottomEdge = Math.min(y + h, m.endTop - s);
    const arch = (m.door.width / 2) * (1 - zoom);
    const corner = m.radius * (1 - zoom);
    journey.style.clipPath =
      `inset(${y}px ${width - x - w}px ${height - bottomEdge}px ${x}px round ${arch}px ${arch}px ${corner}px ${corner}px)`;

    const flight = clamp((s - m.zoomEnd) / (m.endTop - height - m.zoomEnd));
    const count = this.scenes.length;
    const q = clamp((flight - 0.1) / 0.9) * (count - 1);
    const current = Math.min(Math.floor(q), count - 1);
    const fraction = q - current;
    const enter = smooth(0.3, 1, fraction);

    this.scenes.forEach((scene, i) => {
      const image = scene.firstElementChild as HTMLElement;
      if (i < current || i > current + 1) {
        scene.style.visibility = "hidden";
      } else if (i === current) {
        scene.style.visibility = "visible";
        scene.style.clipPath = "none";
        image.style.transform = `scale(${1.04 + 0.06 * (1 - zoom) + 0.3 * fraction})`;
      } else {
        scene.style.visibility = enter > 0.001 ? "visible" : "hidden";
        const side = (1 - enter) * 39;
        const round = (1 - enter) * 50;
        scene.style.clipPath =
          `inset(${(1 - enter) * 30}% ${side}% ${(1 - enter) * 14}% ${side}% round ${round}vw ${round}vw 0 0)`;
        image.style.transform = `scale(${1.3 - 0.26 * enter})`;
      }
    });

    this.captions.forEach((caption, i) => {
      const d = q - i;
      const last = i === count - 1;
      const opacity =
        smooth(-0.3, -0.08, d) * (last ? 1 : 1 - smooth(0.38, 0.55, d)) * smooth(0.08, 0.11, flight) * smooth(0.95, 1, zoom);
      caption.style.opacity = String(opacity);
      caption.style.transform = `translate3d(0, ${(1 - smooth(-0.3, -0.08, d)) * 24}px, 0)`;
    });

    const title = this.$("#home-goal-tunnel-title");
    const titleOpacity = smooth(0.85, 1, zoom) * (1 - smooth(0.05, 0.085, flight));
    title.style.opacity = String(titleOpacity);
    title.style.visibility = titleOpacity > 0.001 ? "visible" : "hidden";
    title.style.setProperty("--spread", String(smooth(0.03, 0.085, flight)));
    this.$("#journey-shade").style.opacity = String(0.25 + 0.3 * titleOpacity);
  }

  private updateEnd(s: number, dt: number) {
    const m = this.metrics;
    const pin = clamp(s - m.endTop, 0, Math.max(m.endHeight - this.height, 0));
    this.$("#end-section-outer").style.transform = `translate3d(0, ${pin}px, 0)`;
    this.$("#end-section-inner").style.opacity = String(smooth(m.endTop - this.height * 0.4, m.endTop + this.height * 0.15, s));

    // Scrolling past the end fills the bar on the booking strip, then starts the call.
    const progress = clamp(this.overscroll / (this.height * 2.2));
    this.$("#scroll-nav-next-bar-inner").style.transform = `scaleX(${progress})`;
    if (progress >= 1 && this.time - this.calledAt > 4) {
      this.calledAt = this.time;
      this.overscroll = 0;
      window.location.href = this.$("#scroll-nav-section").dataset.path!;
    }
    this.overscroll = Math.max(this.overscroll - dt * this.height * 0.5, 0);
    if (this.scroll < this.maxScroll - 4) this.overscroll = 0;
  }
}
