import { languageName, normaliseLang, translate } from './core';

/** A system-prompt line asking for replies in the learner's language. Empty for English and for unknown codes (treated as English). */
export function languageInstruction(code: string | undefined): string {
  const lang = normaliseLang(code);
  return lang === 'en' ? '' : translate('en', 'ai.languageInstruction', { language: languageName(lang) });
}
