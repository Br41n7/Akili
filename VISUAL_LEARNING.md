# Akili Visual Learning Engine (Phases 1-3)

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
19 built-in diagrams for core topics. A lesson whose **title** matches an alias (whole words) or whose key
concept equals one uses the built-in spec: no AI request, same content every time. Matching is deliberately
strict ("Biceps femoris" does not match "biceps brachii").
- Every entry ships `reviewed: false` and the UI says **"Built-in schematic · awaiting review"**. I wrote
  these from standard textbook content; they have not been checked by a subject expert. After an expert checks
  one, set `reviewed: true` and the chip changes to "reviewed". Nothing in code verifies the content.
- A model can never produce `curated` or `curated_reviewed`; provenance is forced to `ai_generated`.
- To add one: add the spec to `curated-data.ts`, an entry with unique aliases to `curated.ts` (a test fails on
  duplicate aliases or an invalid spec).

## Phase 3: molecules, formulas, more visuals
- **Skeletal structures** (`visual_type: molecular_structure`, `display: "skeletal"`): every atom has a `symbol`
  and fine coordinates `at {x,y}` (0-100, y down). Carbons are tappable corners; heteroatoms are lettered with
  hydrogens filled in from valence (OH, NH₂, NH₃⁺). Bonds: `bond_order` for double/triple, `bond_style`
  `wedge` (toward viewer, narrow end at `from`), `dash` (away), `bold` (front edge of a Haworth ring).
- **Verified formula** (`lib/visual/chem.ts`): the formula is *derived* from the bonds by standard valence and
  must equal the spec's `formula`, or the spec is rejected. Over-bonded atoms are rejected too. This checks
  bookkeeping (counts, valences). It cannot tell you the structure is the right molecule.
- **Formula and atom-count questions** are computed from that derivation, never recalled.
- **Curated molecules:** β-D-glucose (Haworth), L-alanine, palmitic acid, AMP. Also a gait-cycle timeline
  (Perry phases and percentages) and a schematic action-potential graph. All `reviewed: false`.
- Wide molecules (long chains) open pre-zoomed. Connectors that would run behind another structure are not
  drawn (they would link the wrong pair); the diagram says how many were left out.
- Known simplifications: adenine uses one Kekulé form; AMP is a flat connectivity drawing (sugar OH
  stereochemistry not shown); alanine is the neutral form (zwitterion noted in the caveat); glucose is the
  β-pyranose Haworth form only (no α, no chair).
- **Not built:** AI-generated illustrations. See the note in the project README section below.

## Tap the structure
"Tap the structure that…" questions are generated for tappable diagrams. They are only asked when the set of
correct taps is small and fully known (stated answer + what chains/inverses/geometry also make true, max 2);
otherwise skipped. While one is open the diagram sends taps to the quiz. "Show choices instead" gives the
same question as multiple choice.

## Zoom
Pinch with two fingers or use the +/- buttons (100–300%). The frame blocks browser page-zoom so the gesture
zooms the diagram. Not yet tested on a real device.

## Molecules (Phase 3)
- `display: "skeletal"` draws rings, sugars, nucleotides and fatty acids: carbons are corners, heteroatoms are lettered
  with their hydrogens filled in from standard valence (OH, NH₂). Every atom needs `symbol` and `at {x,y}` (0-100,
  y down). Bonds use `bond_order`; `bond_style` is `wedge` (toward viewer), `dash` (away) or `bold` (front edge of a
  Haworth ring).
- **Formula check (`lib/visual/chem.ts`)**: when every atom is explicit, the formula is derived from the bonds and
  compared with the spec's `formula`. A mismatch, an over-bonded atom, or a formula on a structure with
  functional-group nodes is rejected. This verifies atom bookkeeping, not that the drawing is the right molecule.
- Questions: molecular formula (with plausible wrong formulas), atom counts for C/N/O.
- Built-in (awaiting review): β-D-glucose (Haworth), L-alanine, palmitic acid, AMP.

## Other Phase 3 visuals
- Gait cycle timeline (eight phases, Perry terminology, stance 0-60% / swing 60-100%) and an action-potential graph
  with a schematic curve. Both built-in and awaiting review.
- Not built: AI-generated illustrative images. No image provider is configured and I could not verify a provider API
  offline. The structured diagrams never depend on image generation.

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
`npm test` (271 tests, Vitest) · `npm run typecheck`

## Why there are no generated illustrations
The brief allowed optional generated images. They are not included: image models draw plausible-looking but
unverifiable anatomy and chemistry, I could not test any image provider from here, and an unlabelled image
sitting next to verified diagrams would undermine them. If you add one later, keep it out of `VisualSpec`
(no URLs in specs), serve it from your own route as a data URL, and frame it as "illustration, not a diagram".
