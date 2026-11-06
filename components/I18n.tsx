'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES, readLang, saveLang, translate, type LangCode } from '@/lib/i18n/core';
import type { MessageKey } from '@/lib/i18n/messages';

type Ctx = { lang: LangCode; setLang: (l: LangCode) => void; t: (k: MessageKey, v?: Record<string, string | number>) => string };
const I18nContext = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (k, v) => translate('en', k, v) });

/** Starts in English so server and browser markup match, then switches to the saved language after load. */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('en');
  useEffect(() => { const l = readLang(); setLangState(l); if (typeof document !== 'undefined') document.documentElement.lang = l; }, []);
  const setLang = useCallback((l: LangCode) => { saveLang(l); setLangState(l); }, []);
  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export const useT = () => useContext(I18nContext);

export function LanguagePicker() {
  const { lang, setLang, t } = useT();
  return (
    <div>
      <label htmlFor="akili-lang" className="text-base font-bold">{t('settings.language')}</label>
      <p className="text-sm text-muted">{t('settings.languageDesc')}</p>
      <select id="akili-lang" value={lang} onChange={e => setLang(e.target.value as LangCode)} className="mt-2 h-11 w-full rounded-xl border border-rule bg-paper px-3 text-sm">
        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>
    </div>
  );
}
