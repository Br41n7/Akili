# Akili Visual Learning Engine (Phase 1 + Phase 2)

Structured, deterministic diagrams inside lessons. The model returns **JSON only**; Akili's own
components draw it. Nothing the model writes is ever executed or inserted as HTML.

## Flow
Lesson text → `shouldConsiderVisual` (free keyword gate) → AI planner (`task: visual_planner`) →
`validateVisualDecision` (server, in the existing `runAIJSON` retry loop) → cached in `lesson.visual`
(inside `courses.modules` JSONB) → re-validated → `<VisualRenderer>` → Explain / Test me.

Any failure at any step renders nothing; the lesson is unchanged.

## Code map
| Path | Role |
|---|---|
| `lib/visual/schema.ts` | `VisualSpec` types, zod schema, safety scan, consistency checks, `safeVisualSpec` |
| `lib/visual/vocab.ts` | Closed relation/direction vocabulary + hand-written glossary |
| `lib/visual/planner.ts` | Gate, planner prompt, `requestLessonVisual` |
| `lib/visual/explain.ts` | Spec-built explanation + optional AI wording constrained to spec ids |
| `lib/visual/quiz.ts` | Deterministic questions + scaffold ladder |
| `lib/visual/adaptive.ts` | Bridge to existing `recordEvidence` / learner concepts |
| `lib/visual/lesson.ts` | Cache helpers for `lesson.visual` |
| `lib/visual/layout.ts` | Order-preserving anatomy grid, molecule layout, hierarchy depth |
| `components/visual/*` | `VisualRenderer` (registry) + one component per diagram type, `VisualQuiz`, `LessonVisual` |

## Anatomy encoding
- Connectors: origin (O, blue), insertion (I, green), nerve (N, dashed gold, arrow to the muscle), blood supply
  (A, dotted red, arrow to the muscle), joint (●). Every colour has a letter badge and a key.
  Mark a muscle's ends with `attaches_to` + `role: "origin" | "insertion"` (from = muscle, to = bone).
- Detail panel splits Origin / Insertion / Action / Innervation / Blood supply into labelled rows.
- Depth: `superficial_to` / `deep_to` (and `anterior_to` / `posterior_to` when `view` is anterior/posterior)
  give each structure a depth rank. Deeper structures get a shadow and a "show down to…" control fades them.
  A loop in depth relations is rejected.
- `cross_section`: layers in `sequence` (outer → inner, last = solid core). Place a structure inside a layer
  with `section: { ring, angle (0 = top, clockwise), span }`. Overlapping wedges are rejected.

## Adaptive loop
- In a lesson: miss a relation/sequence/description question → ladder of up to 5 steps (what the word means →
  find it on this diagram → warm-up on the same structures → the original → a fresh one at the same level).
  Ladder questions are recorded as evidence but not scored. Missing the original twice points to Explain.
- Missed Quiz / Exam questions and Ask AI answers get "See it as a diagram" (`ConceptVisual`): on tap only,
  simplest diagram, not stored.
- Learning Profile shows diagram practice (overall, direction words pooled, concepts to revisit) from
  `learning_evidence` rows with `interaction_type = 'diagram_question'`. No new tables.

## Curated library (`lib/visual/curated.ts`, data in `curated-data.ts`)
13 built-in diagrams for core topics. A lesson whose **title** matches an alias (whole words) or whose key
concept equals one uses the built-in spec: no AI request, same content every time. Matching is deliberately
strict ("Biceps femoris" does not match "biceps brachii").
- Every entry ships `reviewed: false` and the UI says **"Built-in schematic · awaiting review"**. I wrote
  these from standard textbook content; they have not been checked by a subject expert. After an expert checks
  one, set `reviewed: true` and the chip changes to "reviewed". Nothing in code verifies the content.
- A model can never produce `curated` or `curated_reviewed`; provenance is forced to `ai_generated`.
- To add one: add the spec to `curated-data.ts`, an entry with unique aliases to `curated.ts` (a test fails on
  duplicate aliases or an invalid spec).

## Tap the structure
"Tap the structure that…" questions are generated for tappable diagrams. They are only asked when the set of
correct taps is small and fully known (stated answer + what chains/inverses/geometry also make true, max 2);
otherwise skipped. While one is open the diagram sends taps to the quiz. "Show choices instead" gives the
same question as multiple choice.

## Zoom
Pinch with two fingers or use the +/- buttons (100–300%). The frame blocks browser page-zoom so the gesture
zooms the diagram. Not yet tested on a real device.

## Adding a visual type
1. Add the name to `VISUAL_TYPES` in `lib/visual/schema.ts` (plus any per-type rule in `superRefine`).
2. Add a component and one line in the `REGISTRY` in `components/visual/VisualRenderer.tsx`.
3. Add a fixture and tests. `render.test.tsx` fails if a type has no renderer.

## Config
`NEXT_PUBLIC_AKILI_AUTO_VISUALS=false` makes the planner run only when the learner taps
"Show a diagram" (default: automatic, once per lesson, then cached). No other env vars.

## Cost
At most one planner request per eligible lesson, ever (cached, including "no visual needed").
Lessons with no science/structure vocabulary cost nothing. Test me is free. Explain is free; the
optional "Explain in simpler words" is one request.

## Scientific-accuracy policy
- Diagrams are labelled "AI-made schematic · simplified". They are not verified against a curated source.
- The validator rejects impossible valences, spatial relations that contradict the diagram axes,
  dangling references, markup and URLs. It cannot check that an anatomical or biochemical claim is true.
- Anatomy layout is order-preserving, so a diagram never draws A below B when the spec says A is superior to B.
- Direction vocabulary (medial, proximal…) is defined from a hand-written glossary, not the model.
- A `provenance: 'curated'` slot exists for human-reviewed specs; the model can never set it.

## Tests
`npm test` (204 tests, Vitest) · `npm run typecheck`
