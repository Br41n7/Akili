import { describe, expect, it } from 'vitest';
import { addLesson, saveCompletedLessons } from '@/lib/course-progress';

/** A table that behaves like course_progress: UNIQUE(course_id, user_id), primary key id. */
function fakeClient(opts: { failTimes?: number } = {}) {
  const rows: any[] = []; let fails = opts.failTimes ?? 0; const calls: any[] = [];
  return { rows, calls, from: () => ({ upsert: async (row: any, o?: { onConflict?: string }) => {
    calls.push({ row, o });
    if (fails > 0) { fails--; return { error: { message: 'network' } }; }
    const key = o?.onConflict || 'id';
    const hit = rows.find(r => key.split(',').every(k => r[k] === row[k]));
    if (hit) { Object.assign(hit, row); return { error: null }; }
    if (rows.some(r => r.course_id === row.course_id && r.user_id === row.user_id)) return { error: { message: 'duplicate key value violates unique constraint' } };
    rows.push({ id: `r${rows.length}`, ...row }); return { error: null };
  } }) };
}

describe('saving course progress', () => {
  it('the second and later lessons save too (the original bug)', async () => {
    const c = fakeClient(); let done: string[] = [];
    for (const id of ['l1', 'l2', 'l3']) { done = addLesson(done, id); expect(await saveCompletedLessons(c as any, 'c1', 'u1', done)).toBe(true); }
    expect(c.rows).toHaveLength(1); expect(c.rows[0].completed_lessons).toEqual(['l1', 'l2', 'l3']);
    expect(c.calls.every(x => x.o?.onConflict === 'course_id,user_id')).toBe(true);
  });
  it('retries once on a blip, then reports failure honestly', async () => {
    expect(await saveCompletedLessons(fakeClient({ failTimes: 1 }) as any, 'c', 'u', ['a'])).toBe(true);
    expect(await saveCompletedLessons(fakeClient({ failTimes: 2 }) as any, 'c', 'u', ['a'])).toBe(false);
  });
  it('never adds a lesson twice', () => { expect(addLesson(['a'], 'a')).toEqual(['a']); expect(addLesson(['a'], 'b')).toEqual(['a', 'b']); });
});
