# Akili Visual Learning Engine (Phase 1 + Phase 2 core)

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
`npm test` (129 tests, Vitest) · `npm run typecheck`
