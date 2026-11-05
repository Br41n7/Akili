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

## Search grounding (off by default)

Turn it on with `NEXT_PUBLIC_AKILI_FEATURES=search_grounding` (or `NEXT_PUBLIC_AKILI_PLAN=pro`). It needs the `GEMINI_API_KEY` already set; `GEMINI_GROUNDING_MODEL` optionally picks a different model. Free setup: nothing changes, and "beyond my notes" lessons are simply marked "Beyond your notes".

When on and the learner ticks "beyond my notes":
1. For each module, the app calls `POST /api/ai/ground` (signed-in users only). It asks Gemini, with Google Search, for short research notes on that module, built from the module's own title and lesson titles, never from text the learner typed.
2. The notes are given to the normal module-writing request as reference facts. Lessons that use them are marked "From the web", and the app attaches the sources (https only) at the end of the lesson. Links written by the model are discarded.
3. Notes with no cited source are refused. If research is off, fails or finds nothing, the module is written without it and its extra lessons stay "Beyond your notes". A failure never stops the course.
4. Each research call counts against the learner's daily AI allowance (20 a day today), so a deep course can use it up quickly. Raise the allowance per plan (`planQuota` takes a limit) when you add paid tiers.

Not verified, so check before enabling in production:
- The real Gemini call. The tool format (`tools: [{ google_search: {} }]` on `generateContent`) and the citation fields are from memory of the API; Google's current docs describe a newer "Interactions" API. Run a test on a paid key and look at the sources.
- Google's terms for grounded results may require showing "search suggestions" next to the answer. Read the Gemini API terms for "grounding with Google Search" first.
- Cost: Google's docs say the first 5,000 search requests a month are free for Gemini 3 and later, then $14 per 1,000. Confirm on your own billing page.

## If a module will not write ("The AI tutor is busy right now")

That message means every AI provider failed in a way other than a plain rate limit (a plain rate limit says "Many students are studying right now"). The error now ends with the categories that failed (and the provider's own short error code, such as `json_validate_failed`, when it gives one), for example `(groq: rate_limit 429; gemini: server 503)`. The same information is in the server logs: look for `[ai] groq/... failed: <kind> <status>` lines and the final `{"task":"course_module","ok":false,"failures":[...]}` line in Vercel's logs.

What the failure kinds usually mean:
- `server 503` or `server 500`: the provider is overloaded. Wait and retry; the app now does this itself twice.
- `rate_limit 429`: a per-minute or per-day free-tier limit. Wait, or add a paid key.
- `bad_request 400/413`: the request itself was refused (too large for that model, or an unsupported setting). Send me the line.
- `auth 401/402/403`, `model_missing 404`: a key or model name in the environment is wrong, or the account is out of credit (402, for example DeepSeek with no balance). Top it up or remove that key from the environment.
- `empty`, `truncated`: the model returned nothing, or ran out of room.

What the app now does by itself: retries a busy service twice (after 4 s and 10 s), pauses 1.5 s between modules, and asks for at most 2 lessons per request so each answer is smaller.

The free daily allowance is 20 AI requests. A staged course uses one request for the outline plus one or two per module, so a deep course can use most of a day. Raise it with the server variable `AI_FREE_DAILY_LIMIT` (for example 60); it is capped at 1000.

Course outlines and modules now run at low reasoning effort with output caps (3,000 and 7,000 tokens). That keeps Gemini inside its time limit and keeps requests small for Groq's per-minute token limits.

## Material limits by plan

How much of a learner's material a course may read depends on the plan (`lib/plan.ts`):

| | Free (default) | Paid |
|---|---|---|
| Material read | about 30,000 characters (~17 pages) | about 150,000 (~83 pages) |
| Deep depth | locked | allowed |

- Learners pick which materials to use (checklist with page counts). Nothing selected means all.
- If the selection is too big, Akili does **not** silently cut. Short files are kept whole, the remaining budget is shared fairly between long files (each keeps its beginning, cut at a sentence end), and a notice says exactly what was read and what was not. The same notice shows before building and as a toast after.
- "Add more to this course" reuses the materials the course was built from.
- Turn paid behaviour on with `NEXT_PUBLIC_AKILI_PLAN=pro`, or per feature: `NEXT_PUBLIC_AKILI_FEATURES=long_materials,deep_courses`.
- Honest caveat: `NEXT_PUBLIC_*` flags are deployment-wide and the limit is applied in the browser. It is a product gate, not a security one. For real per-user paid plans, store the plan on the user's profile and pass it as `capabilities(env, userPlan)`; also enforce the limit server-side then. The function already accepts that argument.

## Why only course modules failed while flashcards and study guides worked (hypothesis, not confirmed)

Lessons contain LaTeX formulas, whose backslashes are invalid inside JSON strings. Groq's strict JSON mode rejects such output with `json_validate_failed` (the `groq: bad_request 400` in the error line). Flashcards and study guides have no formulas, so they pass. Changes: the prompt now tells the model to double backslashes; on `json_validate_failed` the same model is asked again without strict JSON mode (our own parser and repair step check it); lessons are requested 2 at a time instead of 3 so Gemini is less likely to time out. If the error line still shows a different code after deploying, send it.

## Save error: `record "new" has no field "updated_at"` (code 42703)

The database has an updated_at trigger on `courses` but the table has no such column, so every update is refused (inserts still work, which is why the outline saved but no module could). Run `supabase/migrations/0011_courses_updated_at.sql` in the Supabase SQL editor. This may also be what broke saving lesson progress.

## Correction: courses now read the whole document (not the first ~7 pages)
Uploads store a 12,000-character preview in `documents.content` and the whole text in `documents.chunks`. The course builder used only `content`, so a 100-page PDF contributed about 7 pages whatever the plan limit said. It now reads `chunks` (via `documentText`, capped at 200,000 characters per file), so the page counts shown in the materials list and the Free/Pro limits are true. Quiz, exam, study-tool and Ask AI still read only the preview; widening those is a separate change.

## Maths, page references and clearer lessons (phase4h)
Reported by a learner: formulas showed as `\n[\ce{A + B <=> C + D}]`, lessons skipped parts of the PDF, and explanations were hard to follow.
- **Broken maths:** two causes. (1) The prompt told the model both to write line breaks as `\n` and never to write `\n`, so some replies carried the two characters literally; fixed to one clear rule. (2) Models lost the backslash in `\[ ... \]`, leaving `[ ... ]`. `lib/math-text.ts` now repairs this when a lesson is shown (so lessons already saved are fixed too): literal `\n` becomes a line break, and a line starting with `[ ... ]` that looks like TeX becomes `$$ ... $$`. The prompt now asks for `$$...$$`. Chemistry (`\ce{}`) works because KaTeX's mhchem extension is loaded.
- **Page references:** new PDF uploads carry `[Page N]` markers in their text; lessons are asked to cite "(page 12)". **Files uploaded before this change have no page marks; re-upload them to get page references.** Word and PowerPoint files have none (PowerPoint slides are already numbered).
- **Coverage and style:** the outline prompt must place every chapter or page range in some lesson in order; lessons are asked for plain words, step-by-step explanation, a worked example per idea before any diagram, and no "draw this" unless essential. Lesson length rose slightly (about 300-450 words at university level).
- **Not verified:** none of this was run against a real model. Whether a model truly covers every page and cites correct page numbers must be checked on a real PDF. A very long file is still limited by the plan's page budget, so "covers everything" is only true for what the plan reads.

## Page-by-page courses (phase4i)
In the build form, "How should it teach?" has **By topic** (the AI plans themes, as before) and **Page by page**.
- **Outline without AI:** `lib/page-walk.ts` reads the `[Page N]` marks in the chosen PDFs and groups pages into lessons (up to 3 pages, fewer when pages are dense), and lessons into modules of 4. Every page lands in exactly one lesson, in order, so none can be skipped. Titles are "Pages 1-3", and the model may add a topic after a colon.
- **Per-lesson text:** each lesson is written from only its own pages (`pageContext`), with a `## Page N` section per page, every definition/formula/example on the page explained step by step, and an added example (marked "Example (added):") where the page has none.
- **Cost:** no AI call for the outline, then about one request per 2 lessons (about 1 per 6 pages). The plan's page budget still applies, so Free reads about 17 pages and Pro about 83 (editable in Admin → Plans).
- **Needs page marks:** only PDFs uploaded since phase4h have them. Notes, Word files and older PDFs are left out of this style, and the form says so.
- **Not verified:** no run against a real model. Whether lessons really cover every item on a page and cite pages correctly needs a real PDF test.

## Past questions library (phase4i)
`/pastq` lists live PastQ banks (read with the learner's own session; RLS allows `status = 'live'`). Free banks and banks the learner owns import in one tap through the existing `/import?bank=` flow. Paid banks show the price and **Buy on PastQ** (opens PastQ in a new tab); when the learner returns, the page refetches purchases on tab focus and the button becomes **Import**. Buying stays on PastQ on purpose: its Paystack checkout and the `purchases` row written by its webhook remain the single record, so there is no second payment system to reconcile.
- Set `NEXT_PUBLIC_PASTQ_BANK_URL` to PastQ's bank page, for example `https://pastq.co/bank/{id}`. I do not know PastQ's real page path, so until you set it the button opens the PastQ home page.
- Prices are read as kobo (the `question_banks` table comment says so) and shown in naira. If PastQ stores naira instead, prices will look 100 times too small; check one paid bank.
- Not verified against the real PastQ data or a real purchase.

## When a module stops (phase4k)
Report: a Pro learner uploaded a ~19 MB PowerPoint; the course outline appeared but modules did not get written and it "just stopped". Cause not confirmed (no error text or server log was available). Changes made:
- If writing a pair of lessons fails with a malformed or cut-off answer, a timeout or a hosting 5xx error, the builder now retries those lessons one at a time before reporting failure.
- A failure now scrolls into view, so it is not missed below the module list.
- To find the real cause: read the red message (it ends with the provider reasons in brackets), and in Vercel open Logs, filter `/api/ai/generate`, and look at the `[ai]` lines for that time.
