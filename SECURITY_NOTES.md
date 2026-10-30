# Security notes (CodeQL fixes)

- **Server-side request forgery, `app/api/documents/import-url`:** all fetching now goes through `lib/safe-url.ts`. Only http/https on ports 80/443, no credentials, no internal names. The host is resolved by our own lookup and every address must be public (the check is used by the socket itself, so DNS rebinding cannot swap in an internal address). Redirects are followed by hand and re-checked at each hop; 10 s timeout, 2 MB cap. Google Docs/Slides export URLs are rebuilt from a validated file id.
- **Bad HTML filtering / incomplete sanitization (`import-url`, `upload`, `lib/visual/schema.ts`, `lib/visual/explain.ts`):** tag-stripping regexes replaced by `lib/text-safe.ts` (single-pass scanner, repeated until stable; entities decoded once; script/style/comments removed by string search). Output is plain text, never markup.
- **DOM text reinterpreted as HTML (`components/QuizMode.tsx`):** uploaded picture type must be png/jpeg/webp/gif and its data must be pure base64 (`safeImageSrc`); anything else renders nothing.
- **Incomplete URL substring check (`tests/ai/helpers.ts`):** compares the parsed hostname instead of a substring.
- Re-run CodeQL after merging; I could not run it here, so alert closure is unconfirmed.
