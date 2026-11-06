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
- English, French, Spanish, Portuguese (`lib/i18n/messages.ts`). Add a language: add a catalog and an entry in `LANGUAGES`;
  `tests/i18n.test.ts` fails if a key is missing.
- The wording was written by an AI and is NOT reviewed by native speakers. Have each checked before launch.
- Picker is in Settings. The choice is stored in the browser (localStorage), first visit follows the browser language. It does not
  follow the learner across devices (that needs a profile column and a migration; not done).
- Translated now: project tabs, settings, project list header and buttons, landing "Sign in", course navigation buttons.
  Everything else (quiz, exam, ask, plans, errors, auth pages, landing text) is still English.
- AI replies: `callAI` sends the language, the server validates it against the supported list and adds one line to the system prompt.
  JSON keys stay English. Models are weaker in some languages; this was not tested with a real model.
