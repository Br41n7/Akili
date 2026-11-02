# Plans, limits and admin controls

Plans are **data**, not code. Prices, limits and features live in the `plans` table and are edited in the app at `/admin/plans` (Settings shows the link to admins). No deploy is needed to change a price.

## Setup
1. Run `supabase/migrations/0012_plans.sql` in the Supabase SQL editor. It seeds `free` and `pro` with starting values.
2. Make yourself an admin: `UPDATE profiles SET role = 'admin' WHERE email = 'you@example.com';`
3. Open `/admin/plans`. The Pro price starts empty ("price coming soon"). Set it when you decide.

Until the migration is run, the app uses built-in defaults (`DEFAULT_PLANS` in `lib/plans-db.ts`), so nothing breaks.

## Starting values (all editable; chosen by me, not measured)
| | Free | Pro |
|---|---|---|
| AI requests per day | 20 | 200 |
| Material per course | ~17 pages | ~83 pages |
| Projects | 5 | no limit |
| Images per day | 0 | 20 |
| Features | none | all |

## Who is on Pro
`subscriptions` holds one row per learner: plan, status, end date. Pro counts only while `status = 'active'` and the end date has not passed. Today the only writer is the admin ("Give someone Pro", for testers and prizes). A payment webhook (Paystack) will write the same row later; nothing else needs to change.

## What the server enforces
- AI requests per day (every AI call): `app/api/ai/generate`, `app/api/ai/ground`.
- Projects per learner: `app/api/projects`.
- Web research (search grounding) is only available if the plan includes it.

## What is only a hint (browser)
- Material per course and Deep depth are applied in the browser while the course is built. A determined user could bypass them. Moving source loading to a server route would enforce them; not done yet.

## Safety
- Admin routes check the `admin` role on the server for every call. The page itself is only a shell.
- Every plan edit, grant and revoke is written to `plan_audit`.
- Edits are validated against fixed bounds (price up to ₦100,000, limits within sensible ranges). Free cannot be priced, turned off or given features.
- Learners can read plans and their own subscription, and write neither (row-level security).
- The `NEXT_PUBLIC_AKILI_PLAN` / `NEXT_PUBLIC_AKILI_FEATURES` variables still work, but only ADD to a plan (handy for a launch promotion).

## Not built yet
Payments, receipts and automatic renewal; storage-size caps per plan (project count is the stand-in); a free trial.

## Custom tutor style (Pro feature `custom_tutor_style`)
Free learners choose from five preset tutor styles. Pro learners can also write their own (10 to 300 characters, e.g. "explain like a football commentator"). Details:
- Saved through `PUT /api/profiles`, which checks the plan on the server (403 `PLAN_REQUIRED` on Free). Clearing is always allowed.
- Used at answer time only if the learner's plan STILL includes the feature, read from the database, never from the request. If Pro ends, the tutor quietly returns to the friendly default (the text stays saved).
- The text goes to the AI as a quoted description that may change voice, tone, examples and pacing only, never facts, output formats, or safety rules.
- Removed the unused, unvalidated `custom_agent_prompt` and `preferred_model` fields from the profile update route.
- Run `0014_custom_tutor_style_and_region.sql`. An admin can take the feature off Pro in `/admin/plans`.

## Global reach
- Public copy, the page title, exam boards (A-Level, GCSE, IB, AP, SAT, ACT, CBSE and national curriculum added), class names (Grade, Year, Class), more subjects and 10 more countries (UK, US, Canada, Australia, Uganda, Tanzania, Egypt, Pakistan, Bangladesh) are now worldwide.
- New accounts default to the country "Other" (neutral examples) until a country is chosen. The "African" mnemonic style is now "My region".
- Not done: payments for non-Nigerian learners (prices are in naira with Paystack), translations of the interface, and exam-specific question formats for the new boards beyond the general wording.
