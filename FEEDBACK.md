# Feedback and ratings

Two ways for learners to tell you how it is going, one table (`feedback`, migration 0013):

1. **Send feedback** card at the bottom of Settings: type (general / idea / problem), optional 1-5 stars, a message.
2. **"Was this lesson clear?"** after a learner marks a lesson complete: one tap (Yes = 5, Not really = 1, with an optional "what was unclear" note). Asked once per lesson per device.

## Setup
Run `supabase/migrations/0013_feedback.sql` in Supabase. Admins (`profiles.role = 'admin'`) see **Admin: feedback** in Settings (`/admin/feedback`): newest first, filters (new, problems, ideas, ratings), an average rating and a per-area breakdown, and new / read / done triage.

## What is stored
Kind, rating, message (plain text, max 2,000 characters), where it came from (`context`), an optional reference id such as a lesson id, the page path (query string and `#` removed), the plan, and the learner id. Lesson text and course content are never sent.

## Safety
- Written by the server only, after validation. The learner id always comes from the session, never from the request.
- Messages are stripped to plain text. At most 8 items per learner per hour.
- Learners can read their own feedback; only admins read everyone's, through the server.
- If an account is deleted, its feedback stays but is no longer linked to a person.

## Not built yet
Replies to learners, email alerts for new feedback, and exports. The admin page is the inbox for now.
