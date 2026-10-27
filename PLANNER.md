# Study planner

A Plan tab in each project. The learner sets an exam date, daily study time and days off; Akili writes a dated timetable.
No AI is used, so it is free to run and the same input always gives the same plan (`lib/study-plan.ts`).

## How the plan is shaped
- **Learning days:** unfinished lessons in course order, fitted to the daily time. Every 6th learning day is a catch-up day with no new material.
- **Revision days (about the last 20%, 2 to 7 days):** weak concepts first (the weakest go to Get unstuck), a recap of each module in turn, flashcards, and a timed mock exam.
- **Day before:** a light recap. **Exam day:** a quick look at flashcards.
- If the lessons cannot fit the time set, the plan says how many minutes a day it needs and makes the days longer.
- Lessons tick themselves when finished in the Course tab. Other tasks are ticked by hand.
- **Rebuild from today** spreads the remaining work over the days left, without discarding what is ticked.

## Reminders
When a plan has something left today, the daily reminder reads "Today's study plan" with the task names and minutes, and opens the Plan tab.
With nothing left, or no plan, it falls back to the usual flashcards or weak-concept reminder.

## Set up
Run `supabase/migrations/0010_study_plans.sql`. Until then the tab shows "Planner not set up yet" and nothing else is affected.

## Not covered yet
One exam date per project. Several dates at once (a test in three weeks and an exam in three months) is not built.
Verified by tests and a production build; not tried in a browser or on a real device.
