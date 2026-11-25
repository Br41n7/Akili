# Chat history and pictures inside lessons (phase 4v)

## 1. Ask AI remembers the conversation
- Migration `0018_chat_history.sql` adds `chat_messages` (one row per message, owner-only RLS, same rule as notes). **Run it in Supabase.**
- `lib/chat-history.ts`: `loadChat` (last 100 messages), `saveChatMessage`, `clearChat`. Error messages are never saved. Saving is best-effort: if the table is missing, chat still works for that visit and simply is not remembered.
- `components/AskAI.tsx` loads the history on open, saves each question and answer, and has a **Clear chat** button (asks to confirm). Only the last 6 messages (each cut to 1,200 characters) are sent back to the model, so long histories do not grow the prompt or the daily quota use.
- Not remembered: the "Check my understanding" quick questions (they are rebuilt on request).

## 2. Pictures from your own files, inside lessons
- When a PDF, PowerPoint or Word file is uploaded in Materials, Akili finds its pictures **in the browser** (the existing figures finder, `lib/figure-browser.ts`) and saves up to 15 per file to the private `figures` bucket, in the background, one file at a time. The upload never waits for it and never fails because of it.
- `lib/lesson-figures.ts` places them. Lessons cite sources like `(Bio.pdf, page 12)`. A picture from page 12 is shown under the section (heading) that cites page 12, with "Figure from Bio.pdf, page 12", its printed caption if one was found, and "Shown with: <section heading>". If a page has several pictures and several sections cite it, they are handed out in reading order, so each part lands beside its own paragraph. Pictures from files with no page numbers (slides, Word) appear after the lesson only if the lesson cites that file.
- "Explain this part" under a picture calls the existing vision task, counts against the daily AI allowance, and is labelled AI-drafted.
- Deleting a file in Materials also deletes its pictures (`DELETE /api/figures?project_id=&source=`).
- Switches: `AKILI_FIGURES=false` turns every figures route off (it is now ON by default). `NEXT_PUBLIC_AKILI_LESSON_FIGURES=false` stops the automatic finding at upload. The separate **Figures tab** is still hidden unless `NEXT_PUBLIC_AKILI_FIGURES=true`. AI-drawn diagrams and online diagram search stay on hold.

## Limits and honest gaps
- **Not run in a real browser.** The PDF/zip reading and canvas drawing are the same code as phase 4f and were never run here in a browser. Placement, saving, the routes, the lesson screen and chat history are tested (fakes for the database and network).
- **Whole pictures, not cut pieces.** A diagram is shown whole, beside the sections that cite its page. Cutting one diagram into labelled parts needs a vision model to return boxes; that is not built and its accuracy is unknown.
- **Only files uploaded after this update** get pictures (originals are not stored). Re-upload a file to get its pictures.
- Placement depends on the lesson citing the page. Lessons built without page markers show no pictures; scanned PDFs read by OCR have pictures only if the page image is detected as a figure.
- **Free plan cap is 10 saved pictures** (`max_figures`, editable in Admin → Plans), so a textbook fills it fast. Raise it only after thinking about storage: up to 450 KB each.
- Diagrams drawn as vector lines (not embedded pictures) are not detected.
- Deleting a whole project or account still leaves picture files in Storage (existing gap).
