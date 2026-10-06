/**
 * How visuals are stored inside the existing `courses.modules` JSONB.
 * No schema change: `lesson.visual` is simply an extra optional key on a lesson.
 * Old courses (no key) and courses written by the unchanged Generate Course
 * flow keep working exactly as before.
 */
import { safeVisualSpec, type VisualSpec } from './schema';

export type StoredVisual =
  | { status: 'ready'; spec: VisualSpec; created_at: string; simplified?: boolean }
  | { status: 'none'; reason?: string; created_at: string };

/** Read and re-validate whatever is stored. Anything malformed is treated as "no visual stored". */
export function readStoredVisual(lesson: any): StoredVisual | null {
  const v = lesson?.visual;
  if (!v || typeof v !== 'object') return null;
  if (v.status === 'none') return { status: 'none', reason: typeof v.reason === 'string' ? v.reason : undefined, created_at: String(v.created_at ?? '') };
  if (v.status === 'ready') {
    const spec = safeVisualSpec(v.spec);
    return spec ? { status: 'ready', spec, created_at: String(v.created_at ?? ''), simplified: !!v.simplified } : null;
  }
  return null;
}

/** Returns a new modules array with one lesson's visual replaced. Never mutates. */
export function withLessonVisual(modules: any[], lessonId: string, visual: StoredVisual | null): any[] {
  return (modules || []).map(m => ({
    ...m,
    lessons: (m.lessons || []).map((l: any) => {
      if (l.id !== lessonId) return l;
      const { visual: _old, ...rest } = l;
      return visual ? { ...rest, visual } : rest;
    }),
  }));
}
