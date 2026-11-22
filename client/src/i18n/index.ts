import { createI18n } from 'vue-i18n';
import el from './locales/el';

// Greek, the default, is part of the app; English is loaded the first time
// it's chosen (a separate file, kept by the service worker for offline use).
// Both have the same keys, so the fallback never shows.
const loaders: Record<string, () => Promise<{ default: any }>> = {
  en: () => import('./locales/en'),
};

/** The language chosen last time on this device. */
export const savedLocale = (() => {
  try {
    return localStorage.getItem('locale') || 'el';
  } catch {
    return 'el';
  }
})();

export const i18n = createI18n({
  legacy: false,
  locale: 'el',
  fallbackLocale: 'el',
  messages: { el } as Record<string, any>,
});

/** Makes a language's texts available (loads them once). */
export const loadLocale = async (lang: string) => {
  if (i18n.global.availableLocales.includes(lang as any) || !loaders[lang]) return;
  i18n.global.setLocaleMessage(lang as any, (await loaders[lang]()).default);
};

/** Switches the app to a language, loading its texts first if needed. */
export const setLocale = async (lang: string) => {
  await loadLocale(lang);
  (i18n.global.locale as any).value = lang;
  // Screen readers pronounce the page in it, and CSS capitals follow it
  // (Greek capitals drop their accents only when the page says "el").
  if (typeof document !== "undefined") document.documentElement.lang = lang;
};
