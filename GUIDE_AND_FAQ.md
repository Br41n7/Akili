# Start-here guide and FAQ (phase 4q)

- **Start here tab** (`components/ProjectGuide.tsx`): first appears under "More" (phone) and in the side list (desktop). Shows four first
  steps (add materials, build a course, take a quiz, try a mock exam) ticked from real activity: documents/notes, `courses`,
  and `exam_attempts` rows with type `quiz` / `exam`. Below it, every other tool in one line, tappable.
- **Next-step card** at the top of Materials (the default landing tab for a new project): shows the first step not done yet, with a
  "Hide" link (remembered per project in the browser only).
- **After-activity prompts** (`components/AfterActivity.tsx`): after a lesson is completed, a quiz, an exam.
- **FAQ** at `/faq` (public, translated into all five languages), linked from the landing footer and the Start-here tab.
- Not verified in a real browser. A step counts as done once a row exists; a quiz started and abandoned does not count.
- Not done: hero video (on hold), FAQ link inside Settings, a first-run walkthrough overlay.
