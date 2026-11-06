import { supabase } from '@/lib/supabase';

/** Hard ceiling in the browser. The learner's plan sets the real limit on the server (Free 10 MB, Pro 25 MB by default). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
import { ALLOWED_EXTENSIONS, extensionOf, withExtension } from '@/lib/file-types';
import { needsDirectUpload } from '@/lib/large-upload';
import { chunkText } from '@/lib/text-chunks';
import { dbSafe } from '@/lib/text-safe';
import { ocrNote } from '@/lib/scan-ocr';
export { ALLOWED_EXTENSIONS, extensionOf, isInAppBrowser, withExtension } from '@/lib/file-types';
// Extensions AND media types. Some phones and in-app browsers only offer a proper file picker when they are given media types.
export const ACCEPTED_TYPES = [
  '.pdf,.txt,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.webp',
  'application/pdf', 'text/plain', 'application/msword', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/webp',
].join(',');

/** Returns a message the learner can act on, or null when the file is fine. */
export function checkFile(file: File): string | null {
  const ext = extensionOf(file);
  if (!ALLOWED_EXTENSIONS.includes(ext || '')) {
    return `${file.name} is not a supported file type (PDF, Word, PowerPoint, TXT, or Image).`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is too large (50 MB is the most any plan allows).`;
  return null;
}

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** When the server answers with something that is not our JSON (a hosting error page, for instance), say what the status means. */
export function uploadFailureNote(status: number): string {
  if (status === 401 || status === 403) return 'Your session ended. Please sign in again and retry.';
  if (status === 413) return 'That file is too large to send. Try a smaller file, or split it into parts.';
  if (status === 504 || status === 408) return 'Reading that file took too long. Try a smaller file or fewer pages.';
  if (status >= 500) return 'The server had a problem reading that file. Please try again in a minute.';
  return 'That file could not be processed.';
}

/**
 * Reads a PDF/TXT file on the server, then saves it as a document in the project.
 * Throws an Error whose message is safe to show to the learner.
 */
export interface UploadOptions {
  /** Called with a short progress line while a scanned PDF is being read. */
  onStatus?: (message: string) => void;
  /** Called once after a scanned PDF is read, with a sentence about how well it went. */
  onNote?: (note: string) => void;
  signal?: AbortSignal;
  /** Interface language code, used to pick the text-recognition language for scans. */
  language?: string;
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** Scanned PDFs are read in the browser. Returns null for normal PDFs (and on any failure), so the usual server path runs. */
async function readScanned(file: File, o: UploadOptions): Promise<{ name: string; content: string; chunks: string[] } | null> {
  if (!isPdf(file)) return null;
  let scan: typeof import('@/lib/scan-browser');
  try { scan = await import('@/lib/scan-browser'); } catch { return null; }
  const probe = await scan.probePdf(file);
  if (!probe.scanned) return null;
  o.onStatus?.('This PDF is scanned pictures. Reading the pages…');
  const result = await scan.ocrPdf(file, { langs: scan.ocrLanguages(o.language || 'en'), signal: o.signal, onProgress: (d, t) => o.onStatus?.(`Reading scanned pages ${Math.min(d + 1, t)} of ${t}…`) });
  if (!result.text.trim()) throw new Error(result.cancelled ? 'Stopped before any page was read.' : 'No text could be read from those scanned pages. Make sure the scan is straight and clear, or upload a clearer copy.');
  o.onNote?.(ocrNote(result));
  return { name: file.name, content: result.text.slice(0, 12000), chunks: chunkText(result.text) };
}

export async function uploadDocument(file: File, projectId: string, userId: string, options: UploadOptions = {}) {
  file = withExtension(file);
  const problem = checkFile(file);
  if (problem) throw new Error(problem);

  const scanned = await readScanned(file, options);
  let data: { name?: string; content: string; chunks: string[] } | null = scanned;
  if (!data) {
  let res: Response;
  try {
    if (needsDirectUpload(file.size)) {
      // Big file: it cannot go through the app server (Vercel allows 4.5 MB per request), so it goes straight to Storage first.
      const start = await fetch('/api/documents/upload/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, name: file.name, size: file.size }) });
      const grant = await start.json().catch(() => null);
      if (!start.ok || !grant?.token) throw new Error(grant?.error || 'Could not start that upload. Please try again.');
      const { error: putError } = await supabase.storage.from(grant.bucket).uploadToSignedUrl(grant.path, grant.token, file, { contentType: file.type || undefined });
      if (putError) throw new Error('The file could not be sent. Check your connection and try again.');
      res = await fetch('/api/documents/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, storage_path: grant.path, name: file.name }) });
    } else {
      const form = new FormData();
      form.append('file', file);
      form.append('project_id', projectId);
      res = await fetch('/api/documents/upload', { method: 'POST', body: form });
    }
  } catch (e: any) {
    throw new Error(e?.message && !/fetch|network/i.test(e.message) ? e.message : 'You seem to be offline. Check your connection and try again.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.error || uploadFailureNote(res.status));
  data = body;
  }
  if (!data) throw new Error('That file could not be processed.');

  const { data: doc, error } = await supabase
    .from('documents')
    .insert({ project_id: projectId, user_id: userId, name: data.name || file.name, content: dbSafe(data.content), chunks: dbSafe(data.chunks), source_type: 'upload' })
    .select()
    .single();
  if (error || !doc) throw new Error('The file was read but could not be saved. Please try again.');
  return doc;
}
