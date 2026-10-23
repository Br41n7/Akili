/** Decides whether a user may import a PastQ question bank. Pure, so it can be tested without a database. */

export interface BankRow { id: string; price?: number | string | null; status?: string | null }
export interface PurchaseRow { id: string; imported_to_akili?: boolean | null; akili_project_id?: string | null }

export type Access =
  | { ok: true; kind: 'purchased' | 'free' }
  | { ok: false; code: 'NOT_PURCHASED' | 'BANK_UNAVAILABLE'; message: string };

/** Banks a student can take without paying. `approved` is accepted because PastQ uses it before a listing goes `live`. */
const OPEN_STATUSES = ['live', 'approved'];

export const isFreeBank = (b: BankRow) => Number(b.price ?? 0) === 0;

export function resolveAccess(bank: BankRow, purchase: PurchaseRow | null): Access {
  // A completed purchase is always honoured, even if the listing was later withdrawn.
  if (purchase) return { ok: true, kind: 'purchased' };
  if (!OPEN_STATUSES.includes(String(bank.status ?? ''))) {
    return { ok: false, code: 'BANK_UNAVAILABLE', message: 'This question bank is not available for import yet.' };
  }
  if (isFreeBank(bank)) return { ok: true, kind: 'free' };
  return { ok: false, code: 'NOT_PURCHASED', message: 'This question bank is paid. Complete the purchase on PastQ, then import it here.' };
}
