import { DEPTHS } from '@/lib/course-builder';

/**
 * Server-side check for Deep courses. Courses are planned in the browser, so the server cannot trust a "depth" the browser
 * reports. It reads the size the outline prompt actually asks for instead ("exactly N modules, about M lessons each"):
 * anything bigger than the Standard shape is a Deep course and needs the deep_courses feature. Someone who edits the
 * prompt to dodge this only gets a Standard-sized course. The daily AI allowance (also server-side) limits the rest.
 */
export function outlineSizeFromPrompt(prompt: string): { modules: number; lessonsPer: number } | null {
  const m = /exactly (\d{1,2}) modules?/.exec(prompt); const l = /about (\d{1,2}) lessons/.exec(prompt);
  return m && l ? { modules: Number(m[1]), lessonsPer: Number(l[1]) } : null;
}
export function isDeepOutline(task: string, prompt: string): boolean {
  if (task !== 'course_outline') return false;
  const size = outlineSizeFromPrompt(prompt); if (!size) return false;
  return size.lessonsPer > DEPTHS.standard.lessonsPer || size.modules > DEPTHS.standard.modules[1];
}
