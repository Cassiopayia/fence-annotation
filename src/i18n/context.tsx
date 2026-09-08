import { createContext, useContext, useEffect, useState } from "react";
import { EN, DE } from "./strings";

export type Lang = "en" | "de";
export type TranslationKey = keyof typeof EN;

type TranslationDict = Record<TranslationKey, string>;

const translations: Record<Lang, TranslationDict> = {
  en: { ...EN },
  de: { ...DE },
};

type I18nContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextType | null>(null);

export const I18N_STORAGE_KEY = "i18n.lang";

function translate(
  lang: Lang,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  let value = translations[lang][key] ?? translations.en[key] ?? key;
  if (vars) {
    for (const [name, val] of Object.entries(vars)) {
      value = value.replace(`{${name}}`, String(val));
    }
  }
  return value;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(I18N_STORAGE_KEY);
      return stored === "de" || stored === "en" ? stored : "en";
    } catch {
      return "en";
    }
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(I18N_STORAGE_KEY, l);
    } catch (err) {
      console.error("Failed to persist language:", err);
    }
  };

  const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

/** Non-React fallback (SSR / error boundaries before hydration). */
export function t(
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  try {
    const lang = localStorage.getItem(I18N_STORAGE_KEY) as Lang | null;
    return translate(lang ?? "en", key, vars);
  } catch {
    return translate("en", key, vars);
  }
}
