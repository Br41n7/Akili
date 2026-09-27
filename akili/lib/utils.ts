import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function callAI(body: object): Promise<any> {
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'AI request failed');
  return data.result;
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
