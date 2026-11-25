/**
 * Browser-only. After a file is uploaded to Materials, finds the pictures inside it and saves them privately, so lessons can
 * show them beside the text that explains them. Best-effort: any failure is swallowed and the upload itself is never affected.
 * Not unit-tested for the PDF/zip reading (that needs a real browser); the saving loop is tested with fakes.
 */
export const MAX_AUTO_PER_FILE = 15;
export const lessonFiguresOn = (env: Record<string, string | undefined> = { v: process.env.NEXT_PUBLIC_AKILI_LESSON_FIGURES }) => env.v !== 'false';
export const canHavePictures = (name: string) => /\.(pdf|pptx|docx)$/i.test(name);

type Found = { blob: Blob; page: number | null; caption: string; source: string };
type Post = (fd: FormData) => Promise<{ ok: boolean; status: number }>;

/** Saves up to MAX_AUTO_PER_FILE pictures. Stops at the first refusal (plan full, switched off, signed out). Returns how many were saved. */
export async function saveFound(found: Found[], projectId: string, post: Post): Promise<number> {
  let saved = 0;
  for (const c of found.slice(0, MAX_AUTO_PER_FILE)) {
    const fd = new FormData(); fd.set('file', c.blob, 'figure'); fd.set('project_id', projectId); fd.set('source_name', c.source);
    if (c.page) fd.set('page', String(c.page)); if (c.caption) fd.set('caption', c.caption);
    try { const r = await post(fd); if (r.ok) saved++; else if ([401, 403, 404, 429].includes(r.status)) break; } catch { break; }
  }
  return saved;
}

let queue: Promise<unknown> = Promise.resolve(); // one file at a time, so a phone is not asked to read several PDFs at once
export function extractPictures(file: File, projectId: string): Promise<number> {
  if (!lessonFiguresOn() || !canHavePictures(file.name)) return Promise.resolve(0);
  const job = queue.then(async () => {
    try {
      const { findFigures, releaseCandidates } = await import('@/lib/figure-browser');
      const found = await findFigures(file);
      try { return await saveFound(found, projectId, fd => fetch('/api/figures', { method: 'POST', body: fd }).then(r => ({ ok: r.ok, status: r.status }))); }
      finally { releaseCandidates(found); }
    } catch { return 0; }
  });
  queue = job.catch(() => 0);
  return job;
}

export async function removePictures(sourceName: string, projectId: string): Promise<void> {
  try { await fetch(`/api/figures?project_id=${encodeURIComponent(projectId)}&source=${encodeURIComponent(sourceName)}`, { method: 'DELETE' }); } catch { /* best effort */ }
}
