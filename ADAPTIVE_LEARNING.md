# Akili Adaptive Learning

This update connects Ask AI, Course practice, Quiz Mode, and Exam Mode to a persistent learner model.

## Database
Run `supabase-adaptive-migration.sql` in the Supabase SQL Editor after the existing Akili schema. It creates:

- `learner_concepts` — current concept-level learning state
- `learning_evidence` — evidence from chat/practice/quiz/exam/lesson interactions
- `update_adaptive_concept(...)` — guarded RPC used to update mastery estimates

RLS restricts both tables to the authenticated user. The RPC also verifies that the caller's auth user matches the supplied user id.

## What changed

- **Ask AI:** loads relevant learner context and adds a `Check my understanding` action that generates a 3-question inline quick check.
- **Quiz Mode:** blank-topic quizzes prioritize weak concepts; submissions record per-question evidence and run a lightweight adaptive analysis.
- **Exam Mode:** exam questions use learner context and per-question results feed the learner model.
- **Course:** lesson practice records learning evidence; the existing course progress query was corrected to use `course_id`, matching the database schema.
- **Learning Profile:** new tab shows current focus, concepts needing practice, and concepts with stronger evidence.
- **AI routing:** added adaptive task names to the existing Gemini/Groq routing layer.

## Important

Mastery values are heuristic product signals, not scientifically validated measures of ability. The UI deliberately describes them as evidence-based estimates.

## Suggested rollout

1. Apply `supabase-adaptive-migration.sql`.
2. Deploy the updated application.
3. Test a project with a small amount of material.
4. Ask a question in Ask AI, run a quick check, then run an adaptive quiz.
5. Open Learning Profile and verify that concepts and evidence appear.
