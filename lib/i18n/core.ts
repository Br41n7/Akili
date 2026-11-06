import { CATALOGS, en, type MessageKey } from './messages';

export const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'fr', name: 'Français' }, { code: 'es', name: 'Español' }, { code: 'pt', name: 'Português' },
] as const;
export type LangCode = (typeof LANGUAGES)[number]['code'];
export const STORAGE_KEY = 'akili_lang';

export const isLang = (v: unknown): v is LangCode => typeof v === 'string' && LANGUAGES.some(l => l.code === v);

/** Picks a supported language from a stored value or a browser locale such as "fr-CA". Falls back to English. */
export function normaliseLang(v: unknown): LangCode {
  const base = typeof v === 'string' ? v.toLowerCase().split(/[-_]/)[0] : '';
  return isLang(base) ? base : 'en';
}

export const languageName = (code: string) => LANGUAGES.find(l => l.code === code)?.name || 'English';

/** Translates a key, falls back to English, then fills {placeholders}. */
export function translate(lang: string, key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = CATALOGS[lang]?.[key] || en[key] || key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : raw;
}

/** Browser only: the saved language, else the browser's language. */
export function readLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normaliseLang(saved);
  } catch { /* storage unavailable */ }
  return typeof navigator !== 'undefined' ? normaliseLang(navigator.language) : 'en';
}
export function saveLang(code: LangCode) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = code;
}
