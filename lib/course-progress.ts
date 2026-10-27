/**
 * Saving which lessons a learner has finished.
 *
 * course_progress has UNIQUE(course_id, user_id). A bare upsert conflicts on the primary key (id) instead, so the
 * first completed lesson saved fine and every later one failed with a duplicate-key error. Naming the conflict
 * columns makes it update the existing row.
 */
export interface ProgressClient {
  from(table: string): { upsert(row: Record<string, unknown>, opts: { onConflict: string }): PromiseLike<{ error: { message?: string } | null }> };
}

export const addLesson = (done: string[], lessonId: string) => (done.includes(lessonId) ? done : [...done, lessonId]);

export async function saveCompletedLessons(client: ProgressClient, courseId: string, userId: string, completed: string[]): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await client.from('course_progress').upsert(
        { course_id: courseId, user_id: userId, completed_lessons: completed, last_accessed_at: new Date().toISOString() },
        { onConflict: 'course_id,user_id' },
      );
      if (!error) return true;
    } catch { /* retry once, then report failure */ }
  }
  return false;
}
