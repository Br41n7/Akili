# Akili API Reference (integration guide)

**Status:** This documents the current application API, not a public third-party API commitment. Most routes use the signed-in user's Supabase session cookie. External applications cannot call them as an anonymous public API; a supported external API-key/OAuth layer, versioning, and rate-limit policy would be needed before advertising public access.

## Base URL

- Local: `http://localhost:3000`
- Production: your deployed Akili origin.

## Authentication

Browser requests should use the active Supabase Auth session. Same-origin `fetch` requests automatically include the session cookie. Do not expose `SUPABASE_SERVICE_ROLE_KEY`, provider API keys, or another user's session to a client.

Unauthenticated requests generally return `401`. Authorization must be checked server-side; do not treat a client-supplied `user_id` as proof of ownership.

## `POST /api/ai/generate`

Main AI generation endpoint used by Akili features.

### Request

`Content-Type: application/json`

```json
{
  "task": "course_builder",
  "prompt": "Generate a course using the supplied source material...",
  "format": "json",
  "persona": "friendly",
  "region": "Nigeria",
  "projectId": "00000000-0000-4000-8000-000000000000",
  "validationType": "course"
}
```

Fields:
- `task` (string, required): feature task identifier. The identifier must be supported by the server's AI routing/validation configuration.
- `prompt` (string, required): prompt text, max 24,000 characters.
- `format` (`json` or `text`, optional; default `text`): JSON tasks return the validated object serialized as a string in `result`; text tasks return generated text in `result`.
- `systemInstruction` (string, optional): extra instruction, max 4,000 characters. Avoid using this to bypass learner-level or source-grounding rules.
- `persona` (string, optional; default `friendly`): `friendly`, `strict`, `socratic`, `exam`, or `research` are the built-in styles.
- `region` (string, optional; default `Nigeria`): cultural-context preference.
- `projectId` (UUID, optional): when supplied, the server loads the project only if it belongs to the authenticated user and adds its level/course context.
- `validationType` (string, optional): selects a server-side structured-output validator.
- `image` (optional): `{ "base64": "...", "mimeType": "image/png" | "image/jpeg" | "image/webp" }`; base64 payload is limited to approximately 8 MB.
- `userGroqKey` (optional): a user-provided Groq key for the current request. Treat this as a sensitive credential; never log or persist it.

### Success response

```json
{ "result": "..." }
```

For `format: "json"`, `result` is currently a JSON-encoded string, not a nested JSON object. Clients should parse it and handle parse/validation errors.

A response may include `keyRejected: true` if a supplied provider key was rejected.

### Error response

```json
{ "error": "Human-readable message", "code": "RATE_LIMIT" }
```

Common status codes:
- `400` malformed JSON or invalid request fields
- `401` missing/expired session
- `404` project not found or not owned by the current user
- `429` rate limit or daily AI allowance exceeded
- `500` unexpected server/provider failure (exact public message is sanitized)

The current implementation applies a 20-request-per-minute in-memory limiter per user and a daily free allowance. In-memory limits are per server instance and are not a distributed rate limiter; revisit before scaling.

## Project materials and notes

The web client currently reads/writes project materials through Supabase tables subject to Row Level Security:
- `projects`
- `documents`
- `notes`
- `courses`
- `course_progress`

The schema and RLS policies in this repository are the source of truth. Do not disable RLS or use a service-role key in a browser app. For an external integration, prefer adding a server-side, versioned API route rather than having third-party applications access the database directly.

## Integration recommendations

1. Pin a supported API version before allowing external clients to depend on the contract (for example `/api/v1/...`).
2. Add API-key or OAuth client authentication, per-client scopes, revocation, and distributed rate limits.
3. Publish a complete OpenAPI schema only after each public route's request/response contract and authorization behavior have been verified.
4. Add request IDs, consistent error codes, pagination, idempotency for writes, and contract tests.
5. Keep provider credentials server-side; never return source documents or notes unless the authenticated user is authorized to access them.
