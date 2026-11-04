# Figures from your own materials

Learners pick a PDF, PPTX, DOCX or photo in the **Figures** tab. Akili finds the pictures **in the browser**, the learner chooses which to keep, and each kept figure is stored as a small image in a **private** Supabase Storage bucket. "Explain this figure" sends the picture to a vision model and saves the answer, so each figure is explained once.

## Flow
1. `lib/figure-browser.ts` (browser only): PDF pages are scanned with pdf.js; image boxes come from `lib/figure-extract.ts` (tested geometry), the page is drawn and cropped, then encoded as WebP (JPEG fallback) at or under 450 KB. PPTX/DOCX: images from `ppt/media` / `word/media` (small ones, duplicates and non PNG/JPEG/WebP skipped).
2. `POST /api/figures` re-checks everything on the server: sign-in, project ownership, plan cap (`max_figures`), real file type from magic bytes, size, caption cleaned to plain text.
3. `GET /api/figures?project_id=` lists the learner's figures with 1-hour signed links. `DELETE /api/figures/[id]` removes the file and the row.
4. `POST /api/figures/[id]/explain` reads the picture from Storage on the server, calls task `figure_explain` (vision providers), saves `explanation`, and counts against the normal daily AI allowance. Output is labelled **AI-drafted**.

## Privacy
Bucket is private; no public URLs. RLS lets a learner select only their own rows. Paths are `userId/projectId/figureId.ext` and `ownsPath` is checked before reading or deleting. Figures never appear in PastQ or any shared page. The caption is passed to the model as quoted data, not instructions.

## Limits (Free / Pro defaults, editable in Admin → Plans)
10 / 200 saved figures per learner. At most 450 KB each, so Free uses about 4.5 MB and Pro at most 90 MB per learner (usually far less).

## Known gaps (not verified)
- Rendering, cropping and the pdf.js worker run only in a browser. They were NOT run in a real browser here; geometry was tested against a real PDF in Node.
- Diagrams drawn as vector lines (not embedded pictures) and scanned pages are not detected. A photo of the diagram works.
- Original files are not stored, so figures are found when the learner picks the file.
- Deleting a whole project or account removes rows but not Storage files. Delete figures first, or purge `figures/<userId>/` in the Supabase dashboard. A scheduled purge is not built.
- Vision answer quality has not been measured on real figures.
