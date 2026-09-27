# Akili implementation update

## Deployment fix
- Split Supabase clients into `lib/supabase/client.ts`, `server.ts`, and `admin.ts`.
- `lib/supabase.ts` is now browser-safe compatibility-only.
- This removes the `next/headers` import from client bundles and fixes the Vercel build failure from `app/projects/page.tsx`.
- Updated Next.js 15 config from `experimental.serverComponentsExternalPackages` to `serverExternalPackages`.

## Learning features
- Adaptive quiz supports English and German.
- Fill-in-the-gap questions are scored locally without another AI call.
- Quiz performance is summarized locally first; AI misconception analysis is only requested when repeated failures justify it.
- AI can generate a visual question from a structured diagram specification. The app renders a safe schematic SVG for skull, heart, cell, and generic concepts.
- Existing chat "Check my understanding" flow remains available.
- University/self-study learning context is supported in projects instead of assuming SSCE.

## Regional context
- Region has broad defaults, but user-provided familiar foods, transport, and everyday objects are merged into the AI context.
- Users can edit their familiar context from Learning Profile.
- Akili is instructed not to force one cultural example on everyone.

## Research
- Research Lab includes deterministic local cleanup first, which consumes zero AI calls.
- Optional AI originality editing preserves the learner's claims and does not attempt to bypass plagiarism/AI detectors.
- Fact generator supports history, science, people, dates, applications, terminology, and memorable facts.

## AI provider fallback
- Gemini, Groq, OpenAI, and DeepSeek can be configured.
- `AI_PROVIDER_ORDER` controls fallback order.
- Missing providers are skipped automatically; provider failures fall through to the next configured provider.

## Upload testing limits
- Maximum individual document size: 2 MB.
- Maximum documents per project: 20 during the free testing phase.
- No subscription logic was added.

## Database
Run in Supabase SQL Editor after the existing schema/migrations:
1. `supabase-adaptive-migration.sql`
2. `supabase-security-fix-migration.sql`

The security migration removes broad thumbnail listing, fixes SECURITY DEFINER search paths, restricts RPC execution, and adds project-ownership defense in the adaptive RPC.
