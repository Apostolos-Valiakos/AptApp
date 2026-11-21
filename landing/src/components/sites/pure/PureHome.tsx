"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import "./pure.css";
import "./pure-extra.css";
import {
  APP_URL,
  ASSETS,
  CONTACT,
  LASER,
  MENU_SECTIONS,
  PRICE_LIST,
  PRODUCTS,
  PRODUCT_PHOTOS,
  SCENES,
  TREATMENTS,
  UI,
  type Lang,
  type Localized,
  type PriceLink,
} from "./content";
import { PureController } from "./controller";
import {
  ArrowRightSmallIcon,
  ArrowUpIcon,
  CloseIcon,
  CtaArrowIcon,
  DiagonalArrowIcon,
  FooterArrowIcon,
  MenuLinkArrowIcon,
  MenuTalkIcon,
  PlayIcon,
  SocialArrowIcon,
} from "./icons";

const LANG_KEY = "pure-lang";
const LANG_EVENT = "pure-lang-change";

function subscribeLang(callback: () => void) {
  window.addEventListener(LANG_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LANG_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function readLang(): Lang {
  try {
    return window.localStorage.getItem(LANG_KEY) === "en" ? "en" : "el";
  } catch {
    return "el";
  }
}

function setLang(lang: Lang) {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this visit only.
  }
  window.dispatchEvent(new Event(LANG_EVENT));
}

/** Greek is the default; the visitor's choice is remembered. */
// "Είσοδος" → the app's login, in the language picked here (if one was
// picked; otherwise the app keeps the user's own language). The app also
// reads this page's setting directly when both share an address.
const LOGIN_URL = `${APP_URL}/login`;
function withChosenLang(event: React.MouseEvent<HTMLAnchorElement>) {
  try {
    const chosen = window.localStorage.getItem(LANG_KEY);
    if (chosen === "el" || chosen === "en") event.currentTarget.href = `${LOGIN_URL}?lang=${chosen}`;
  } catch {
    // storage unavailable: plain link
  }
}

function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, readLang, () => "el" as Lang);
}

const photo = (name: string) => `${ASSETS}/photos/${name}.webp`;

function Crosses({ className, count }: { className: string; count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={className} />
      ))}
    </>
  );
}

function Logo() {
  return <span className="pure-logo" role="img" aria-label="Pure Massage & Spa Experience" />;
}

function Header({ lang }: { lang: Lang }) {
  const t = (text: Localized) => text[lang];
  const other: Lang = lang === "el" ? "en" : "el";
  return (
    <header id="header">
      <div id="header-container">
        <div id="header-background" />
        <button id="header-logo" aria-label={t(MENU_SECTIONS[0].label)} data-scroll-to="home-hero">
          <Logo />
        </button>
        <div id="header-right">
          {/* Into the booking app (staff and clients log in there): the
              header's main button, at every width. */}
          <a id="header-right-talk-btn" href={LOGIN_URL} onClick={withChosenLang} aria-label={t(UI.login)}>
            <div id="header-right-talk-container">
              <span id="header-right-talk-btn-arrow">
                <ArrowRightSmallIcon />
              </span>
              <span id="header-right-talk-btn-text">{t(UI.login)}</span>
              <span id="header-right-talk-btn-dots">
                <span className="header-right-talk-btn-dot" />
              </span>
            </div>
          </a>
          <button
            id="header-lang-btn"
            onClick={() => setLang(other)}
            aria-label={other === "en" ? "Switch to English" : "Αλλαγή σε Ελληνικά"}
          >
            {other === "en" ? "EN" : "ΕΛ"}
          </button>
          {/* Booking is by phone: a round button, wide desktop only (it is
              in the menu as "call us" everywhere). */}
          <a id="header-book-btn" href={CONTACT.phoneHref} aria-label={t(UI.book)} title={t(UI.book)}>
            <svg className="header-book-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6.6 3.5h2.6l1.4 4-2 1.4a12 12 0 0 0 6.5 6.5l1.4-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <button id="header-right-menu-btn" aria-label={t(UI.menu)}>
            <div id="header-right-menu-btn-inner">
              <span id="header-right-menu-btn-text">{t(UI.menu)}</span>
              <span id="header-right-menu-btn-text-close">{t(UI.close)}</span>
              <div id="header-right-menu-btn-dots">
                <span className="header-right-menu-btn-dot" />
                <span className="header-right-menu-btn-dot" />
              </div>
            </div>
          </button>
        </div>
        <div id="header-menu">
          <div id="header-menu-links">
            {MENU_SECTIONS.map((section) => (
              <button key={section.target} className="header-menu-link" data-scroll-to={section.target}>
                <div className="header-menu-link-background" />
                <div className="header-menu-link-inner">
                  <span className="header-menu-link-text">{t(section.label)}</span>
                  <span className="header-menu-link-text-clone">{t(section.label)}</span>
                  <MenuLinkArrowIcon className="header-menu-link-svg" />
                </div>
              </button>
            ))}
            {/* Into the booking app; always here, also when the header
                button is hidden for lack of room. */}
            <a className="header-menu-link" href={LOGIN_URL} onClick={withChosenLang}>
              <div className="header-menu-link-background" />
              <div className="header-menu-link-inner">
                <span className="header-menu-link-text">{t(UI.login)}</span>
                <span className="header-menu-link-text-clone">{t(UI.login)}</span>
                <MenuLinkArrowIcon className="header-menu-link-svg" />
              </div>
            </a>
          </div>
          <a id="header-menu-talk" href={CONTACT.phoneHref}>
            <div id="header-menu-text">{t(UI.call)}</div>
            <MenuTalkIcon id="header-menu-talk-icon" />
          </a>
          <a id="header-menu-labs" target="_blank" rel="noreferrer" href={CONTACT.instagram}>
            <div id="header-menu-labs-inner">
              <div id="header-menu-labs-texts">
                <div id="header-menu-labs-text">Instagram</div>
                <div id="header-menu-labs-text-clone">Instagram</div>
              </div>
              <DiagonalArrowIcon id="header-menu-labs-arrow" />
              <DiagonalArrowIcon id="header-menu-labs-arrow2" />
            </div>
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero({ lang }: { lang: Lang }) {
  const title = UI.heroTitle[lang];
  return (
    <div id="home-hero" className="section">
      <h1 id="home-hero-title" aria-label={title}>
        {title.split(" ").map((word, i) => (
          <span key={`${lang}-${i}`} className="word-wrapper" aria-hidden>
            <span className="word" style={{ transitionDelay: `${0.25 + i * 0.03}s` }}>
              {word}
            </span>
          </span>
        ))}
      </h1>
      <div id="home-hero-visual-container" />
      <div id="home-hero-scroll-container">
        <div id="home-hero-scroll-container-crosses">
          <Crosses className="home-hero-scroll-container-cross" count={4} />
        </div>
        <div id="home-hero-scroll">{UI.scrollToExplore[lang]}</div>
      </div>
    </div>
  );
}

function Reel({ lang }: { lang: Lang }) {
  return (
    <div id="home-reel" className="section">
      <h2 id="home-reel-title">
        <div id="home-reel-title-inner">
          <div id="home-reel-title-line-1">
            <span className="lu-rise">{UI.reelTitle[lang][0]}</span>
          </div>
          <div id="home-reel-title-line-2">
            <span className="lu-rise">{UI.reelTitle[lang][1]}</span>
          </div>
        </div>
      </h2>
      <div id="home-reel-content">
        <p id="home-reel-desc" className="lu-fade">
          {UI.reelText[lang]}
        </p>
        <button id="home-reel-cta" className="lu-fade" data-scroll-to="home-featured">
          <span id="home-reel-cta-dot" />
          <span id="home-reel-cta-text">{UI.reelCta[lang]}</span>
          <span id="home-reel-cta-arrow">
            <CtaArrowIcon />
          </span>
        </button>
      </div>
      <div id="home-reel-thumb-wrapper">
        <div id="home-reel-thumb" />
      </div>
      <div id="home-reel-container">
        <div id="home-reel-container-inner">
          <div id="home-reel-video-container">
            <div id="home-reel-video-container-decoration">
              <div id="home-reel-video-container-top">
                <div className="home-reel-video-container-crosses">
                  <Crosses className="home-reel-video-container-cross" count={5} />
                </div>
              </div>
              <div id="home-reel-video-container-bottom">
                <div className="home-reel-video-container-crosses">
                  <Crosses className="home-reel-video-container-cross" count={5} />
                </div>
              </div>
            </div>
            <div id="home-reel-video-placeholder" />
          </div>
        </div>
      </div>
      {/* The film frame grows from the thumbnail slot into the full-width container on scroll. */}
      <div id="home-reel-frame">
        <video
          id="home-reel-video"
          muted
          loop
          playsInline
          preload="metadata"
          poster={photo("reel-poster")}
        >
          {/* Phones get a lighter 640px copy (about 2.3 MB instead of 5.2 MB). */}
          <source media="(max-width: 812px)" src={`${ASSETS}/video/reel-mobile.mp4`} type="video/mp4" />
          <source src={`${ASSETS}/video/reel.mp4`} type="video/mp4" />
        </video>
        <div id="home-reel-video-title">
          <span>{UI.reelPlay[lang][0]}</span>
          <span>{UI.reelPlay[lang][1]}</span>
        </div>
        <button id="home-reel-video-watch-btn" aria-label={UI.reelPlay[lang].join(" ")}>
          <div id="home-reel-video-watch-btn-base" />
          <div id="home-reel-video-watch-btn-background" />
          <PlayIcon id="home-reel-video-watch-btn-svg" />
        </button>
      </div>
    </div>
  );
}

// --- Live prices from the booking app ---
// The page is static, so it asks the app for current prices once it's open;
// linked items (see PriceLink) then show the app's price and duration, and
// everything else, or everything if the app can't be reached, keeps the
// written `meta`.
type AppPrice = { price: number; duration_minutes: number };
type AppService = AppPrice & { name: string; variations: (AppPrice & { name: string })[] };

const priceKey = (service: string, variation?: string) =>
  `${service.trim().toLowerCase()}|${(variation || "").trim().toLowerCase()}`;

function useLivePrices() {
  const [prices, setPrices] = useState<Map<string, AppPrice> | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${APP_URL}/api/v1/public/prices`)
      .then((res) => (res.ok ? res.json() : null))
      .then((rows: AppService[] | null) => {
        if (cancelled || !Array.isArray(rows)) return;
        const map = new Map<string, AppPrice>();
        for (const svc of rows) {
          map.set(priceKey(svc.name), svc);
          for (const v of svc.variations || []) map.set(priceKey(svc.name, v.name), v);
        }
        setPrices(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (meta: string, link?: PriceLink) => {
    const live = link && prices?.get(priceKey(link.service, link.variation));
    if (!live) return meta;
    const price = Number.isInteger(live.price) ? String(live.price) : live.price.toFixed(2).replace(".", ",");
    return `${price}€ • ${live.duration_minutes}'`;
  };
}

function Treatments({ lang }: { lang: Lang }) {
  const priceFor = useLivePrices();
  const t = (text: Localized) => text[lang];
  return (
    <div id="home-featured" className="section">
      <div id="home-featured-title-top">
        <div id="home-featured-title-wrapper">
          <h2 id="home-featured-title">
            <span className="lu-rise">{t(UI.treatmentsTitle)}</span>
          </h2>
        </div>
        <div id="home-featured-disclaimer" className="lu-fade">
          {t(UI.treatmentsNote)}
        </div>
      </div>
      <div className="project-list">
        {TREATMENTS.map((treatment) => (
          <article key={treatment.id} className="project-item">
            <div className="project-item-main">
              <div className="project-item-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo(treatment.photo)} alt={t(treatment.name)} loading="lazy" draggable={false} />
                {treatment.clip && (
                  <video
                    className="project-item-clip"
                    muted
                    loop
                    playsInline
                    preload="none"
                    src={`${ASSETS}/video/${treatment.clip}.mp4`}
                  />
                )}
              </div>
            </div>
            <div className="project-item-footer">
              <div className="project-item-line-1">
                {t(treatment.category)} • {priceFor(treatment.meta, treatment.link)}
              </div>
              <h3 className="project-item-line-2">
                <span className="project-item-line-2-icon" />
                <span className="project-item-line-2-inner">{t(treatment.name)}</span>
              </h3>
              <p className="project-item-text">{t(treatment.text)}</p>
            </div>
          </article>
        ))}
      </div>
      <button id="home-featured-cta" data-scroll-to="price-list">
        <span id="home-featured-cta-dot" />
        <span id="home-featured-cta-text">{t(UI.priceListCta)}</span>
        <span id="home-featured-cta-arrow">
          <CtaArrowIcon />
        </span>
      </button>
      <div id="price-list">
        <h2 id="price-list-title">{t(UI.priceListTitle)}</h2>
        <div id="price-list-groups">
          {PRICE_LIST.map((group, i) => (
            <details key={group.title} className="price-group" open={i === 0}>
              <summary>
                <span>{group.title}</span>
                <span className="price-group-count">{String(group.items.length).padStart(2, "0")}</span>
              </summary>
              {group.note && <p className="price-group-note">{t(group.note)}</p>}
              <ul>
                {group.items.map((item) => (
                  <li key={item.name.en}>
                    <span>{t(item.name)}</span>
                    <span className="price-group-meta">{priceFor(item.meta, item.link)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

function Products({ lang }: { lang: Lang }) {
  const t = (text: Localized) => text[lang];
  return (
    <div id="home-products" className="section">
      <div className="block-label lu-fade">{t(UI.productsLabel)}</div>
      <h2 className="block-title">
        <span className="lu-rise">{t(UI.productsTitle)}</span>
      </h2>
      <p className="block-text lu-fade">{t(UI.productsText)}</p>
      <div id="home-products-photos">
        {PRODUCT_PHOTOS.map((name) => (
          <div key={name} className="home-products-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo(name)} alt="AHAVA" loading="lazy" draggable={false} />
          </div>
        ))}
      </div>
      <ul id="home-products-list">
        {PRODUCTS.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  );
}

function Laser({ lang }: { lang: Lang }) {
  const t = (text: Localized) => text[lang];
  return (
    <div id="home-laser" className="section">
      <div id="home-laser-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo("laser")} alt={LASER.title} loading="lazy" draggable={false} />
      </div>
      <div id="home-laser-content">
        <div className="block-label lu-fade">{t(UI.laserLabel)}</div>
        <h2 className="block-title">
          <span className="lu-rise">{LASER.title}</span>
        </h2>
        <p className="block-text lu-fade">{t(LASER.text)}</p>
        <ul id="home-laser-points">
          {LASER.points.map((point) => (
            <li key={point.title.en}>
              <strong>{t(point.title)}</strong>
              <span>{t(point.text)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Space({ lang }: { lang: Lang }) {
  return (
    <div id="home-goal" className="section">
      <div id="home-goal-context">
        <div id="home-goal-context-inner">
          <h2 id="home-goal-title" className="lu-fade">
            {UI.spaceTitle[lang]}
          </h2>
          <div id="home-goal-texts" className="lu-fade">
            {UI.spaceText[lang].map((paragraph) => (
              <p key={paragraph} className="home-goal-texts-paragraph">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>
      {/* The doorway the journey starts from; the fixed journey layer is clipped to it until it opens. */}
      <div id="home-goal-image-in-outer">
        <div id="home-goal-image-in-inner">
          <div id="home-goal-image-in" />
        </div>
      </div>
    </div>
  );
}

function Journey({ lang }: { lang: Lang }) {
  return (
    <div id="journey" aria-hidden>
      {SCENES.map((scene, i) => (
        <div key={scene.photo} className="journey-scene" style={{ zIndex: i }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo(scene.photo)} alt="" draggable={false} style={{ objectPosition: scene.focus }} />
        </div>
      ))}
      <div id="journey-shade" />
      <div id="home-goal-tunnel-title">
        {UI.journeyTitle[lang].map((line) => (
          <div key={line} className="home-goal-tunnel-title-line">
            {line.split(" ").map((word, i) => (
              <span key={i}>{word}</span>
            ))}
          </div>
        ))}
      </div>
      <div id="journey-captions">
        {SCENES.map((scene, i) => (
          <div key={scene.photo} className="journey-caption">
            <div className="journey-caption-index">
              {String(i + 1).padStart(2, "0")} / {String(SCENES.length).padStart(2, "0")}
            </div>
            <div className="journey-caption-label">{scene.label[lang]}</div>
            <div className="journey-caption-text">{scene.text[lang]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndSection({ lang }: { lang: Lang }) {
  return (
    <div id="end-section" className="section">
      <div id="end-section-outer">
        <div id="end-section-bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo("massage-room-dark")} alt="" loading="lazy" draggable={false} />
        </div>
        <div id="end-section-inner">
          <div id="end-section-content">
            <div id="end-section-content-crosses">
              <Crosses className="end-section-content-cross" count={5} />
            </div>
            <div id="end-section-subtitle">
              <div id="end-section-subtitle-text">{UI.endSubtitle[lang]}</div>
            </div>
            <div id="end-section-title">
              <a id="end-section-title-link" href={CONTACT.phoneHref}>
                {UI.endTitle[lang][0]} <br /> {UI.endTitle[lang][1]}
              </a>
            </div>
            <div id="end-section-actions">
              <a className="end-action" href={CONTACT.phoneHref}>
                {CONTACT.phone}
              </a>
              <a className="end-action" href={CONTACT.instagram} target="_blank" rel="noreferrer">
                Instagram
              </a>
            </div>
          </div>
          <div id="end-bottom">
            <div className="end-bottom-arrow-container">
              <div className="end-bottom-arrow" />
              <div className="end-bottom-arrow" />
            </div>
            <div id="end-bottom-text-container">
              <div className="end-bottom-text">{UI.continueScroll[lang]}</div>
              <div className="end-bottom-text">{UI.continueScroll[lang]}</div>
            </div>
            <div className="end-bottom-arrow-container">
              <div className="end-bottom-arrow" />
              <div className="end-bottom-arrow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Footer({ lang }: { lang: Lang }) {
  const t = (text: Localized) => text[lang];
  const socials = [
    { label: "Instagram", href: CONTACT.instagram },
    { label: "Facebook", href: CONTACT.facebook },
  ];
  return (
    <div id="footer-section" className="section">
      <div id="footer-bg" />
      <div id="footer-top" />
      <div id="footer-middle">
        <div id="footer-middle-contact">
          <a id="footer-contact-address" href={CONTACT.mapsHref} target="_blank" rel="noreferrer">
            {CONTACT.address[lang].map((line) => (
              <div key={line} className="footer-address-line">
                {line}
              </div>
            ))}
          </a>
          <div id="footer-contact-socials">
            {socials.map((social) => (
              <div key={social.label} className="footer-socials-wrapper">
                <a
                  className="footer-socials-line footer-socials-line-wrapper"
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <SocialArrowIcon className="footer-socials-line-svg" />
                  <span className="footer-socials-text">{social.label}</span>
                </a>
              </div>
            ))}
          </div>
          <div id="footer-contact-enquires">
            <div id="footer-enquires-header">{t(UI.phoneLabel)}</div>
            <div className="footer-enquires-link-wrapper">
              <a id="footer-enquires-link" href={CONTACT.phoneHref}>
                {CONTACT.phone}
              </a>
            </div>
          </div>
          <div id="footer-contact-business">
            <div id="footer-business-header">{t(UI.emailLabel)}</div>
            <div className="footer-business-link-wrapper">
              <a id="footer-business-link" href={`mailto:${CONTACT.email}`}>
                {CONTACT.email}
              </a>
            </div>
          </div>
        </div>
        <div id="footer-middle-map">
          <div id="footer-map-header">
            <span>{UI.findUs[lang][0]}</span>
            <span>{UI.findUs[lang][1]}</span>
          </div>
          <a id="footer-map" href={CONTACT.mapsHref} target="_blank" rel="noreferrer" aria-label={t(UI.openMaps)}>
            <iframe src={CONTACT.mapsEmbed} title={t(UI.openMaps)} loading="lazy" tabIndex={-1} />
            <span id="footer-map-cta">
              {t(UI.openMaps)}
              <FooterArrowIcon />
            </span>
          </a>
        </div>
      </div>
      <div id="footer-bottom">
        <div id="footer-bottom-copyright">{t(UI.rights)}</div>
        <a id="footer-bottom-labs" href={CONTACT.facebook} target="_blank" rel="noreferrer">
          facebook.com/purespaexperience
        </a>
        <div id="footer-bottom-tagline">Not just a spa, an experience</div>
        <div id="footer-bottom-up" role="button" aria-label="Back to top" data-scroll-to="home-hero">
          <ArrowUpIcon />
          <ArrowUpIcon />
        </div>
      </div>
    </div>
  );
}

function BookingStrip({ lang }: { lang: Lang }) {
  return (
    <div id="scroll-nav-section" className="section" data-path={CONTACT.phoneHref}>
      <div id="scroll-nav-content">
        <div id="scroll-nav-subtitle">
          {UI.stripSubtitle[lang][0]}
          <br />
          {UI.stripSubtitle[lang][1]}
        </div>
        <div id="scroll-nav-main">
          <div id="scroll-nav-text">{UI.stripTitle[lang]}</div>
          <a id="scroll-nav-next" href={CONTACT.phoneHref}>
            <div id="scroll-nav-next-text">{CONTACT.phone}</div>
            <div id="scroll-nav-next-bar">
              <div id="scroll-nav-next-bar-inner" />
            </div>
            <div id="scroll-nav-next-arrow">
              <FooterArrowIcon />
            </div>
          </a>
        </div>
        <div id="scroll-nav-cross-line">
          <Crosses className="scroll-nav-cross" count={5} />
        </div>
      </div>
    </div>
  );
}

export function PureHome() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lang = useLang();

  useEffect(() => {
    if (!rootRef.current) return;
    const controller = new PureController(rootRef.current);
    return () => controller.dispose();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div ref={rootRef} id="pure-root">
      <canvas id="canvas" />
      <div id="ui">
        <Header lang={lang} />
        <div id="page-container">
          <div id="page-container-inner">
            <div id="home" className="page">
              <Hero lang={lang} />
              <Reel lang={lang} />
              <Treatments lang={lang} />
              <Products lang={lang} />
              <Laser lang={lang} />
              <Space lang={lang} />
            </div>
            <div id="page-extra-sections">
              <EndSection lang={lang} />
              <Footer lang={lang} />
              <BookingStrip lang={lang} />
            </div>
          </div>
        </div>
        <Journey lang={lang} />
      </div>
      <div id="scroll-indicator">
        <div id="scroll-indicator-bar" />
      </div>
      <div id="video-overlay">
        <video id="video-overlay-video" controls playsInline preload="none" src={`${ASSETS}/video/reel-full.mp4`} />
        <button id="video-overlay-close" aria-label={UI.close[lang]}>
          <CloseIcon />
        </button>
      </div>
      <div id="preloader">
        <div id="preloader-logo" />
      </div>
    </div>
  );
}
