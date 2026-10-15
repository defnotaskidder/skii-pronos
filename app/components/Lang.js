"use client";
// Language: French by default, English on request. Remembered per browser, applied to <html lang>
// and to every date/time helper in ui.js.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, LANGS, LOCALE, marketGroup, marketLabel, translate } from "../../lib/i18n";
import { setLocale } from "./ui";

const Ctx = createContext(null);

function initial() {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const saved = localStorage.getItem("skii-lang");
    if (saved && LANGS[saved]) return saved;
    return DEFAULT_LANG; // French first; EN is a choice, not a guess from the browser
  } catch { return DEFAULT_LANG; }
}

export function LangProvider({ children }) {
  // first render matches the server (French) to avoid hydration mismatches, then the saved choice applies
  const [lang, setLangState] = useState(DEFAULT_LANG);
  useEffect(() => { setLangState(initial()); }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    setLocale(LOCALE[lang]);
    try { document.cookie = `skii-lang=${lang}; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ }
  }, [lang]);
  const value = useMemo(() => ({
    lang, locale: LOCALE[lang],
    setLang: (l) => { if (LANGS[l]) { setLangState(l); try { localStorage.setItem("skii-lang", l); } catch { /* ignore */ } } },
    t: (key, vars) => translate(lang, key, vars),
    tm: (label) => marketLabel(lang, label),
    tg: (group) => marketGroup(lang, group),
  }), [lang]);
  // keep ui.js helpers in sync during render too (effects run after children render)
  setLocale(LOCALE[lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);

export function LangSwitch({ className = "" }) {
  const { lang, setLang } = useT();
  return (
    <div className={`seg lang-switch ${className}`} role="group" aria-label="Language">
      {Object.keys(LANGS).map((l) => (
        <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)} aria-pressed={lang === l}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}
