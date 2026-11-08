import { normaliseLang, translate } from './core';
import { englishName } from './detect';

/** A system-prompt line asking for replies in the learner's language. Empty for English and for unknown codes (treated as English). */
export function languageInstruction(code: string | undefined): string {
  const lang = normaliseLang(code);
  return lang === 'en' ? '' : translate('en', 'ai.languageInstruction', { language: englishName(lang) });
}
