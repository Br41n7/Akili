import { supabase } from '@/lib/supabase';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'docx', 'doc', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'webp'];
export const ACCEPTED_TYPES = '.pdf,.txt,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.webp';

/** Returns a message the learner can act on, or null when the file is fine. */
export function checkFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext || '')) {
    return `${file.name} is not a supported file type (PDF, Word, PowerPoint, TXT, or Image).`;
  }
  if (ext === 'ppt') return `${file.name} is an older PowerPoint (.ppt) file. Akili accepts .pptx or PDF — open it in PowerPoint/Google Slides/LibreOffice, save/export it as .pptx or PDF, then upload again.`;
  if (ext === 'doc') return `${file.name} is an older Word (.doc) file. Akili accepts .docx or PDF — convert it and upload again.`;
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
