import { useI18n } from "vue-i18n";
import { setLocale } from "../i18n";

/** Switches the app between Greek and English, and remembers the choice. */
export const useLocaleToggle = () => {
  const { locale } = useI18n();
  return async () => {
    const next = locale.value === "el" ? "en" : "el";
    await setLocale(next);
    localStorage.setItem("locale", next);
  };
};
