/** Pure helpers for browsing PastQ question banks inside Akili. Buying stays on PastQ; importing happens here. */
import { isFreeBank } from '@/lib/pastq-access';

export interface LibraryBank {
  id: string; title: string; subject: string; exam_type: string; year_start?: number | null; year_end?: number | null;
  school?: string | null; country?: string | null; question_count?: number | null; price?: number | string | null; status?: string | null; description?: string | null;
}
export type BankState = 'owned' | 'imported' | 'free' | 'paid';

/** What the learner can do with a bank. Imported wins over owned, owned over free, so each bank shows one clear action. */
export function bankState(bank: LibraryBank, owned: ReadonlySet<string>, imported: ReadonlySet<string>): BankState {
  if (imported.has(bank.id)) return 'imported';
  if (owned.has(bank.id)) return 'owned';
  return isFreeBank(bank) ? 'free' : 'paid';
}

/** PastQ stores prices in kobo (see the question_banks table). Shown in naira, since PastQ sells in naira. */
export function formatPrice(price: number | string | null | undefined): string {
  const kobo = Number(price ?? 0); if (!Number.isFinite(kobo) || kobo <= 0) return 'Free';
  const naira = kobo / 100;
  return `₦${naira.toLocaleString('en-NG', { maximumFractionDigits: naira % 1 ? 2 : 0 })}`;
}

export const yearsLabel = (b: Pick<LibraryBank, 'year_start' | 'year_end'>) =>
  b.year_start && b.year_end && b.year_start !== b.year_end ? `${b.year_start}-${b.year_end}` : String(b.year_start || b.year_end || '');

export function matchesBank(b: LibraryBank, query: string, exam: string): boolean {
  if (exam && exam !== 'ALL' && b.exam_type !== exam) return false;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return true;
  const hay = `${b.title} ${b.subject} ${b.exam_type} ${b.school || ''} ${b.country || ''} ${yearsLabel(b)}`.toLowerCase();
  return words.every(w => hay.includes(w));
}

/**
 * Where "Buy on PastQ" goes. NEXT_PUBLIC_PASTQ_BANK_URL may contain {id} (for example https://pastq.co/bank/{id});
 * only http(s) addresses are used, and the id is encoded. Falls back to the PastQ home page.
 */
export function buyUrl(template: string | undefined, home: string, id: string): string {
  const pick = (u: string | undefined) => { try { const x = new URL(u || ''); return x.protocol === 'https:' || x.protocol === 'http:' ? x : null; } catch { return null; } };
  const t = template?.trim();
  if (t) { const x = pick(t.replace('{id}', encodeURIComponent(id))); if (x) return x.toString(); }
  return pick(home)?.toString() || 'https://pastq.co/';
}
