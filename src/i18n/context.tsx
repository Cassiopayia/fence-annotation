import { createContext, useContext, useEffect, useState } from "react";
import { EN, DE } from "./strings";

export type Lang = "en" | "de";

type TranslationDict = Record<string, string>;

const translations: Record<Lang, TranslationDict> = {
  en: { ...EN },
  de: { ...DE },
};

type I18nContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = "i18n.lang";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "de" || stored === "en" ? stored : "en";
    } catch {
      return "en";
    }
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch (err) {
      console.error("Failed to persist language:", err);
    }
  };

  const t = (key: string) => {
    return translations[lang][key] ?? translations.en[key] ?? key;
  };

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

export function t(key: string): string {
  try {
    const lang = localStorage.getItem(STORAGE_KEY) as Lang | null;
    return translations[lang ?? "en"][key] ?? translations.en[key] ?? key;
  } catch {
    return translations.en[key] ?? key;
  }
}
