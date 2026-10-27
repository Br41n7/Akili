# Building a course in stages

Before: one AI request wrote the whole course (2 to 4 modules, 12,000 characters of material, notes-only). It stayed small and could time out on free hosting.

Now (`lib/course-builder.ts`, `components/CourseView.tsx`, `components/CourseBuildForm.tsx`):
1. **Choices:** depth (Quick, Standard, Deep), an optional "what do you most want to learn?" box, and "add standard material my notes do not cover" (off by default).
2. **Outline first** (task `course_outline`): module and lesson titles only. The number of modules follows the depth, how much material there is, and whether goals were given. It samples across every document, so later topics are not cut off.
3. **Each module in its own request** (task `course_module`), fed the passages from the materials that match that module. The outline is saved immediately as "pending" modules inside `courses.modules`, so no schema change is needed.
4. **A failed module does not lose the rest.** It stays pending with a "Write" button. Finished modules can be opened while later ones are still being written.
5. **Add more to this course:** adds one module on a topic the learner names (or the next sensible one), without rebuilding.
6. **Beyond your notes:** lessons carry `origin` ("notes", "beyond_notes" or "web"). Beyond-notes lessons start with a visible notice. A lesson may also carry `sources` (https links only); these are shown at the end of the lesson. Web sources are for search grounding, which is not built yet.

The learner's goals are placed in a delimited block and treated as a wish about topics, never as instructions.

Not verified: the AI output quality for each depth (needs real use), and behaviour in a browser. Logic, validators, prompts and the form are covered by tests; the production build passes.
