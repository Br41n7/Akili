# Diagram renderer fix (2026-10-11)

## What the screenshots showed
The deployed quiz was using the legacy `components/GeneratedDiagram.tsx`, not the newer `components/visual/VisualRenderer.tsx` Visual Learning Engine. The legacy SVG forced a 520px minimum width, so it overflowed/cropped on narrow phones. Its `generic` diagram rendered a placeholder box labelled `CONCEPT`, while label connectors converged on that box; it did not actually depict an amino acid. The accompanying amino-acid question was also scientifically inconsistent: the stereocenter is the alpha carbon, not one of the four substituent groups. Glycine is achiral because its alpha carbon has two hydrogen substituents.

## Changes
- Replaced fixed 720x460/min-width SVG with a responsive 360x320 SVG that scales to the available mobile width.
- Added deterministic `amino_acid` schematic: alpha carbon V at the center, with NH2, COOH, H and R groups around it. Coordinates from the model no longer control the layout.
- Updated the visual-question prompt to request topic-appropriate diagrams, specify the amino-acid stereocenter correctly, and prohibit asking which substituent is the stereocenter.
- Added allowed-kind validation for the visual-question response.
- Kept the legacy renderer labelled as a schematic, not a medically/scientifically reviewed illustration.

## Important deployment note
This fix targets the **legacy one-question visual quiz** shown in the screenshots. The newer lesson Visual Learning Engine is a separate path. Deploy this updated source and test the “One visual question instead” action on a phone. Full Next build/Vitest were not run here; syntax/transpilation checks passed for the three touched source files.
