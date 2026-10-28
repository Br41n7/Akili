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

That message means every AI provider failed in a way other than a plain rate limit (a plain rate limit says "Many students are studying right now"). The error now ends with the categories that failed, for example `(groq: rate_limit 429; gemini: server 503)`. The same information is in the server logs: look for `[ai] groq/... failed: <kind> <status>` lines and the final `{"task":"course_module","ok":false,"failures":[...]}` line in Vercel's logs.

What the failure kinds usually mean:
- `server 503` or `server 500`: the provider is overloaded. Wait and retry; the app now does this itself twice.
- `rate_limit 429`: a per-minute or per-day free-tier limit. Wait, or add a paid key.
- `bad_request 400/413`: the request itself was refused (too large for that model, or an unsupported setting). Send me the line.
- `auth 401/403`, `model_missing 404`: a key or model name in the environment is wrong.
- `empty`, `truncated`: the model returned nothing, or ran out of room.

What the app now does by itself: retries a busy service twice (after 4 s and 10 s), pauses 1.5 s between modules, and asks for at most 3 lessons per request so each answer is smaller.

The free daily allowance is 20 AI requests. A staged course uses one request for the outline plus one or two per module, so a deep course can use most of a day. Raise it with the server variable `AI_FREE_DAILY_LIMIT` (for example 60); it is capped at 1000.
