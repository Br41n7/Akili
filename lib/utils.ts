import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Thrown by callAI. `message` is always safe to show to the learner. */
export class AIRequestError extends Error {
  constructor(message: string, readonly code: string = 'UNKNOWN') {
    super(message);
    this.name = 'AIRequestError';
  }
}

const CLIENT_TIMEOUT_MS = 125_000;
let keyWarningShown = false;

/**
 * Call the AI route. Returns the result text (valid JSON text when format is 'json').
 * Pass `projectId` so the server adds the project's level/course context.
 */
export async function callAI(body: object): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.error || typeof data.result !== 'string') {
      throw new AIRequestError(data?.error || 'Something went wrong. Please try again.', data?.code || 'HTTP_' + res.status);
    }
    if (data.keyRejected && !keyWarningShown && typeof window !== 'undefined') {
      keyWarningShown = true;
      console.warn('Your personal API key was not accepted, so the shared service was used.');
    }
    return data.result;
  } catch (err: any) {
    if (err instanceof AIRequestError) throw err;
    if (err?.name === 'AbortError') throw new AIRequestError('This is taking too long. Check your connection and try again.', 'TIMEOUT');
    throw new AIRequestError('You seem to be offline. Check your connection and try again.', 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
}

/** callAI for JSON tasks. The server has already validated the shape. */
export async function callAIJSON<T = any>(body: object): Promise<T> {
  const raw = await callAI({ ...body, format: 'json' });
  const data = safeJsonParse(raw);
  if (data === null || data === undefined) throw new AIRequestError('The AI gave an answer we could not use. Please try again.', 'AI_BAD_OUTPUT');
  return data as T;
}

export function safeJsonParse(text: string): any {
  try {
    const clean = text
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
