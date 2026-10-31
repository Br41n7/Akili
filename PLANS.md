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
