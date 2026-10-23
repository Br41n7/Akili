/** Small, pure helpers for the sign-in, reset and import flows. */

export const MIN_PASSWORD = 8;

/** Only same-site paths are allowed as a post-login destination (no open redirects). */
export function safeRedirect(raw: string | null | undefined, fallback = '/projects'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  const p = raw.trim();
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('\\') || /[\u0000-\u001f]/.test(p)) return fallback;
  try { const u = new URL(p, 'http://x.invalid'); if (u.origin !== 'http://x.invalid') return fallback; } catch { return fallback; }
  return p;
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}

/** Supabase reports an expired or used link in the query string or the hash. */
export function recoveryLinkError(search: string, hash: string): string | null {
  const q = new URLSearchParams(search.replace(/^\?/, ''));
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  const code = q.get('error_code') || h.get('error_code') || q.get('error') || h.get('error');
  if (!code) return null;
  if (/expired|otp/i.test(code) || /expired/i.test(q.get('error_description') || h.get('error_description') || '')) return 'This reset link has expired or was already used. Request a new one.';
  return 'This reset link is not valid. Request a new one.';
}

export const RESET_SENT_MESSAGE = 'If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.';
