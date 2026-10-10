# Visual Learning Engine — corrective patch

## Fixed

1. **Tap-the-structure callback**
   - The listener is now forwarded directly from `VisualQuiz` to `VisualRenderer`.
   - Diagram taps invoke the active quiz resolver instead of returning the resolver function.

2. **Interaction capabilities are authoritative**
   - `VisualSpec.interactions` is now the capability contract.
   - Missing interaction metadata receives safe defaults for backwards compatibility.
   - Explicit interaction arrays are respected.
   - Layer peeling requires `reveal_layers`.
   - Mechanism step navigation requires `step_through`.
   - Label hiding requires `toggle_labels`.

3. **Adaptive remediation**
   - Repeated misses open the explanation automatically.
   - A non-beginner lesson can automatically request one simpler visual after the learner struggles.
   - The request is guarded so it fires once per rendered visual/session and is cancelled on unmount.
   - ConceptVisual now supports the same simpler-visual remediation path.

4. **Alternate anatomical views**
   - Added optional `view_variants` to VisualSpec.
   - Each variant can provide a view, axes, and per-element positions.
   - Variants are validated for element references and spatial contradictions.
   - Learners get a view selector only when multiple validated views exist.
   - The renderer applies the variant geometry/axes before rendering, explanation, and quiz generation.

5. **Planner contract**
   - Planner is explicitly instructed to declare interactions.
   - Planner can return validated alternate anatomy views when genuinely educationally useful.

6. **Regression coverage**
   - Added schema tests for interaction defaults and alternate-view validation.
   - Added tap-resolution regression coverage.

## Verification

- TypeScript `transpileModule` syntax diagnostics: passed for all touched TypeScript/TSX files.
- Full `tsc --noEmit` could not complete because the supplied `node_modules` tree is incomplete and several `@types/*` packages are missing.
- Full Vitest suite and Next production build were therefore not claimed as passed.
