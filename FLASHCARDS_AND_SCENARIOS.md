# Flashcards and scenario questions (phase 4t)

## Flashcards (`components/Flashcards.tsx`, `lib/flashcards.ts`, `components/FlipCard.tsx`)
- Three views: **Study** (spaced review), **Make cards**, **All cards**. An empty deck opens on Make.
- **Cards from my notes** (new): task `flashcard_qa`. The model must copy a short quote from the notes behind every answer. A card is
  kept only if that quote really appears in the excerpts sent (case, punctuation and line breaks ignored, at least 15 letters).
  Cards that fail are dropped and the learner is told how many. Each kept card stores its file and page ("Source: Bio.pdf, page 3")
  and shows it on the back. Repeated questions are skipped. If nothing can be confirmed, nothing is saved.
- **Memory aids** (existing): now read the learner's notes, must use exactly the items the learner listed, in order (checked, one retry),
  and when the notes do not cover the concept the card is labelled "Not from your notes: check it".
- **Study session**: due cards first (or all, shuffled). Tap or Space to flip, then Again / Good / Easy (keys 1, 2, 3). Ladder: 1, 3, 7, 14,
  30, 60 days; Easy skips a step; Again returns in 10 minutes. Uses the existing `review_count` and `next_review_at` columns, so
  the due-card reminders and recommendations keep working. No migration.
- **Card layout**: both faces share one grid cell, so long answers are never clipped; turned-away face hidden from screen readers;
  no turning animation when the device asks to reduce motion; copy and delete are real buttons (were clickable spans inside a button).

## Scenario (application) questions
- New question type `scenario` in Quiz settings ("Scenario (apply it)"). It is opt-in: new quizzes start with multiple choice and fill-the-gap only, and the Exam does not include scenario questions. When chosen with other types the quiz splits its questions across the chosen types. A short situation (person, setting,
  problem) is shown in its own card, then a question such as "which theory or principle applies", four options, one best answer, and an
  explanation that names the principle and why each wrong option does not fit. Marked like multiple choice.
- A scenario with no situation text is dropped by the validator.

## Checked / not checked
- Logic and screens tested with a fake database and a fake AI (tests/flashcards*.test.ts*, tests/scenario-questions.test.tsx),
  including clicking through a study session in jsdom. `jsdom` and `@testing-library/react` were added as dev dependencies.
- NOT checked with a real model: whether it copies quotes faithfully (an unfaithful quote simply means fewer cards), or whether scenario
  questions are good for a subject such as prosthetics. NOT checked on a real phone.
- Quote checking proves the quote is in the notes, not that the answer is a correct reading of it. Scanned (OCR) text with errors can
  make real quotes fail to match.
- The five mnemonic style names and the example placeholders are still English.

## Tables (phase 4u)
- The reading text had no markdown table support (`remark-gfm` was missing), so pipes and dashes showed as plain text. Added `remark-gfm` (strikethrough with a single ~ is off so "~5 mg" is safe).
- `lib/table-text.ts` repairs usual model mistakes before rendering: separator row with the wrong number of columns, no blank line before the table, short or long rows, `<br>` in a cell, a `|` inside a formula. Code blocks are untouched.
- Tables sit in a scrolling box with even column widths, a header row, light row striping and a focusable scroll area. Course prompts now ask for clean tables (max 4 columns).
- Not checked on real phones; lessons stored before this still hold whatever text the model wrote, but are repaired at display time.
