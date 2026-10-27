# Push reminders

One short notification a day, at a time the learner picks: flashcards that are due, otherwise the weakest
concept, otherwise a plain "time to study". It names a concept at most, never scores or answers.

## Set up (once)

1. Run `supabase/migrations/0009_push_reminders.sql`.
2. Make a key pair: `npx web-push generate-vapid-keys`
3. Set these environment variables (server and build):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the public key (it is safe in the browser) |
| `VAPID_PRIVATE_KEY` | the private key (keep secret) |
| `VAPID_SUBJECT` | `mailto:you@yourdomain.com` |
| `CRON_SECRET` | a long random string; protects the job URL |

4. Schedule the job to call `GET /api/push/cron`. **Free default: once a day** (`vercel.json` runs it at 16:00 UTC, about 5 pm in Lagos; everyone gets the reminder then and the time picker is hidden). **Paid: every hour**, plus `NEXT_PUBLIC_AKILI_FEATURES=hourly_reminders` (or `NEXT_PUBLIC_AKILI_PLAN=pro`) to enable per-learner times. Call it, with `Authorization: Bearer <CRON_SECRET>`
   (or the header `x-cron-secret: <CRON_SECRET>`).
   - **Vercel Pro**: change the schedule in `vercel.json` to `0 * * * *`, and Vercel sends the header itself when `CRON_SECRET` is set.
   - **Vercel Hobby only allows one run a day**, which is why the default is daily. Use an outside scheduler
     (cron-job.org, GitHub Actions, Supabase `pg_cron` + `pg_net`) to call the same URL every hour and remove
     the `crons` entry from `vercel.json`.

The job answers `{checked, due, notified, devices, removed, skipped}`. It sends at most one reminder per
learner per local day, and only counts a day as used when a device really received it.

## How a learner turns it on

Settings → Study reminders → Turn on reminders. The browser asks for permission only after that tap.
"Send a test" proves the whole path on that device. On iPhone the app must be added to the Home Screen first
(Apple's rule); the screen says so.

## Where things live

| Piece | File |
| --- | --- |
| Rules (who is due, the message, validation) | `lib/reminders.ts` |
| Sending (VAPID, gone-device handling) | `lib/push.ts` |
| Store or remove a device | `app/api/push/subscribe/route.ts` |
| Test notification | `app/api/push/test/route.ts` |
| Hourly job | `app/api/push/cron/route.ts` |
| Show and click handling | `public/sw.js` |
| Screen | `app/settings/page.tsx`, `components/ReminderSettings.tsx` |

## Not verified from the build sandbox

Real delivery to a phone (needs your VAPID keys, HTTPS and a browser), iOS behaviour, and the hourly
schedule itself. Use "Send a test" after deploying.
