// Small helpers that decide when the course buttons should say "Next module".
export type FlatLesson = { id: string; moduleId?: string };

/** True when `lessons[index]` is the last lesson of its module and another module follows. */
export function endsModule(lessons: FlatLesson[], index: number): boolean {
  const cur = lessons[index], nxt = lessons[index + 1];
  return !!cur && !!nxt && cur.moduleId !== nxt.moduleId;
}

/** Label for the outline's main button. */
export function continueLabel(lessons: FlatLesson[], done: string[]): 'Start first lesson' | 'Continue learning' | 'Next module' {
  if (!done.length) return 'Start first lesson';
  const i = lessons.findIndex(l => !done.includes(l.id));
  if (i > 0 && lessons[i - 1].moduleId !== lessons[i].moduleId) return 'Next module';
  return 'Continue learning';
}
