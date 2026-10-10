# Priority 3 — Assessment configuration

Implemented:
- Quiz question count: 5, 10, 15, 20.
- Exam question count: 5, 10, 15, 20.
- Quiz selectable formats: MCQ/objective, fill-in-the-gap, true/false, I/II/III/IV/V statement-combination, diagram-based when an image is attached.
- Exam selectable formats: MCQ/objective, fill-in-the-gap, true/false, I/II/III/IV/V statement-combination.
- AI prompts now receive the selected count and type requirements.
- Returned questions are filtered to selected types before the assessment starts.
- Existing answer validation and adaptive evidence recording remain in place.

No database migration is required for this Priority 3 patch because the existing `exam_attempts` JSON fields already store the generated questions and answers.

Diagram questions in Exam Mode are intentionally not exposed yet because the Visual Learning Engine has not been rolled out to this testing build.
