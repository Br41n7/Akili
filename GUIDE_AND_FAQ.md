# Project Home, next steps and FAQ (phase 4r)

- **Home tab** (`components/ProjectHome.tsx`, first on the phone bottom bar: Home, Course, Quiz, Exam, More). New projects open on Home.
  A project that already has a course still opens on the Course; `?tab=` links still win. Materials moved into the Home grid and "More".
- **Grid**: four groups (Learn, Practise, Get help, Plan and track), two tiles per row. Groups live in `lib/guide.ts` (`HOME_GROUPS`);
  a test checks every tile is a real project tab with a title in all languages.
- **Live line on tiles** (`tileStatus`): materials count, lessons done of total, days to exam (from the Plan), last quiz and exam score.
  Each query fails on its own and then shows nothing.
- **Next-step card** on top of Home (add materials, build a course, take a quiz, try an exam), hideable per project (browser only).
  A step counts as done once a row exists; an abandoned quiz does not count.
- **After-activity prompts** after a lesson, quiz and exam. **FAQ** at `/faq` (public, five languages).
- Not verified in a real browser. Not done: hero video (on hold), FAQ link in Settings.

## Crash screen (phase 4s)
- `app/error.tsx` and `app/global-error.tsx` replace the bare "Application error" page. A script that failed to download (weak network, or a new deploy while the page was open) triggers one automatic reload (never twice within a minute). Other crashes show a plain message, Reload / Try again buttons and the real error text to screenshot.
- Checked in headless Chromium with a deliberately crashing page. Could NOT reproduce the reported crash on /auth/... (all auth routes and five languages load cleanly in the production build), so its cause is unconfirmed.
