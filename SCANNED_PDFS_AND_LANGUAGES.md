# Scanned PDFs and interface languages (phase 4n)

## Scanned PDFs
- The server's PDF reader cannot read pictures of pages, so scans used to arrive empty. Now the browser checks six sample pages
  (`lib/scan-browser.ts`, `probePdf`); if most have almost no text (`lib/scan-ocr.ts`, `looksScanned`) it reads the pages with
  tesseract.js on the learner's device, one page at a time, and saves `[Page N]` text like any other PDF.
- No upload of the scan, no AI request used. Limit: 120 pages per file (the learner is told). A stop button keeps what was read.
- Language data for tesseract.js downloads from its default CDN the first time it is used (needs internet).
- Poor at handwriting, maths and tables; the note after reading tells learners to check formulas.
- Checked: pure logic (tests/scan-ocr.test.ts); the real tesseract.js engine in Node read a generated image-only page at 95%
  confidence; pdf.js reported 0 text items for an image-only PDF. NOT checked: page drawing, the worker and the stop button in a
  real browser; speed on a low-end phone. Test on a real phone before announcing.

## Interface languages
- English, French, Spanish, Portuguese, Vietnamese (`lib/i18n/messages.ts`). Add a language: add a catalog and an entry in `LANGUAGES`;
  `tests/i18n.test.ts` fails if a key is missing.
- The wording was written by an AI and is NOT reviewed by native speakers. Have each checked before launch.
- Picker is in Settings. The choice is stored in the browser (localStorage), first visit follows the browser language. It does not
  follow the learner across devices (that needs a profile column and a migration; not done).
- Translated now: project tabs, settings, project list header and buttons, landing "Sign in", course navigation buttons, sign in and
  sign up pages (with a small language switch), the Materials screen, Quiz (setup, questions, results), Exam (start, buttons, results
  headings) and Ask AI (empty state, input, send).
  Still English: flashcards, plan, study tools, Get unstuck, Snap & Solve, new-project sheet, forgot/reset password pages, plans, most
  error messages and toasts, the quiz difficulty chips, exam question-type labels, landing text.
## Language of explanations (follows the learner's materials, not the interface)
- With a project, the server samples the newest three documents (first 2,500 characters each), guesses their language
  (`lib/i18n/detect.ts`: English, French, Vietnamese, Spanish, Portuguese, German, Italian, Swahili, Hausa, Yoruba, Arabic, Russian, Chinese,
  Japanese, Korean, Hindi) and tells the model to write in it. French notes with an English interface give French explanations.
- If the material's language is unclear (short or mixed), the model is told to match the material's language without naming one.
- With no project or no material, the interface language is used. JSON keys, code and maths stay as the format requires.
- Detection is a word-list guess, not a trained model: unreliable on very short text, and Yoruba/Hausa/Swahili lists are small.
  It never blocks a request: any failure falls back to the interface language.
- Not tested with a real model; models write some languages worse than English.
