import { supabase } from '@/lib/supabase';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
import { ALLOWED_EXTENSIONS, extensionOf, withExtension } from '@/lib/file-types';
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
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than 10MB.`;
  return null;
}

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reads a PDF/TXT file on the server, then saves it as a document in the project.
 * Throws an Error whose message is safe to show to the learner.
 */
export async function uploadDocument(file: File, projectId: string, userId: string) {
  file = withExtension(file);
  const problem = checkFile(file);
  if (problem) throw new Error(problem);

  const form = new FormData();
  form.append('file', file);
  form.append('project_id', projectId);

  let res: Response;
  try {
    res = await fetch('/api/documents/upload', { method: 'POST', body: form });
  } catch {
    throw new Error('You seem to be offline. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || 'That file could not be processed.');

  const { data: doc, error } = await supabase
    .from('documents')
    .insert({ project_id: projectId, user_id: userId, name: data.name || file.name, content: data.content, chunks: data.chunks, source_type: 'upload' })
    .select()
    .single();
  if (error || !doc) throw new Error('The file was read but could not be saved. Please try again.');
  return doc;
}
