# Akili merged source — merge notes

This project combines `Akili-visual-engine-corrected` and `Akiliv3`.

## Merge strategy
- Base: `Akili-visual-engine-corrected`, preserving its visual-learning engine, diagrams, lesson visuals, visual quiz/anatomy components, and visual-engine tests.
- Added files that existed only in `Akiliv3`, including offline note support, note export, Priority 3 documentation, and other unique source/docs.
- Replaced `components/Materials.tsx` with the Akiliv3 version to retain its richer materials workflow: offline notes, note search/edit/export, sync state, and URL/YouTube/Google Docs-oriented import UI.
- Merged package dependencies and retained test/typecheck scripts from the visual-engine version.
- Kept visual-aware versions of shared course/quiz/exam components so the visual engine remains integrated.

## Important validation status
I attempted `npm install`, but it timed out in this environment. Therefore I have **not** verified a production build or TypeScript/test pass. A clean install and checks are required before deployment:

```bash
npm install
npm run typecheck
npm test
npm run build
```

Review and apply `supabase-notes-migration.sql` in the Supabase SQL editor if the offline-notes feature requires its schema changes. Back up the existing database before applying migrations. Do not commit `.env` secrets.

## Merge caveat
Overlapping implementations cannot always be combined mechanically without regression risk. In particular, the materials component comes from Akiliv3 while course/quiz/exam components come from the visual-engine-corrected branch. The merged project should be treated as a candidate integration build until the checks above pass.
