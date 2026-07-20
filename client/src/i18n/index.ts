import { createI18n } from 'vue-i18n';
import en from './locales/en';
import el from './locales/el';

const savedLocale = localStorage.getItem('locale') || 'el';

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en',
  messages: { en, el },
});
