import { z } from 'zod';

/** Vercel rejects request bodies over 4.5 MB, so anything near that goes straight to Storage instead. */
export const DIRECT_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const TEMP_BUCKET = 'uploads-temp';
export const STALE_TEMP_MS = 60 * 60 * 1000;

export const startFields = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  size: z.number().int().min(1).max(100 * 1024 * 1024),
});
export const finishFields = z.object({ project_id: z.string().uuid(), storage_path: z.string().min(3).max(300), name: z.string().trim().min(1).max(200) });

/** Where a waiting file lives: always inside the learner's own folder. */
export const tempPath = (userId: string, id: string, ext: string) => `${userId}/${id}.${ext.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin'}`;
export const ownsTempPath = (path: unknown, userId: string) =>
  typeof path === 'string' && !path.includes('..') && new RegExp(`^${userId.replace(/[^0-9a-f-]/gi, '')}/[0-9a-f-]{36}\\.[a-z0-9]{1,5}$`, 'i').test(path);
export const needsDirectUpload = (bytes: number) => bytes > DIRECT_THRESHOLD_BYTES;
