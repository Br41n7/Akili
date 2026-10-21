# AI routing

All AI calls are server-side through `/api/ai/generate` and `lib/ai.ts`.

## Task registry: `lib/ai-tasks.ts`
One entry per task: provider order, input type (`text`, `image`, `either`), default validator,
per-attempt timeout, retries, and a low-effort or heavy flag. The route rejects any task that is
not listed, rejects images for text-only tasks, and requires one for image-only tasks.
To add a task, add one entry; to change a provider order, edit that entry.

## Per-call behaviour
1. Providers without a key, or that cannot take the input, are skipped (no call is made).
2. Images go only to Gemini, to OpenAI models matching the vision list in `lib/ai.ts`
   (gpt-4o, gpt-4.1, gpt-4-turbo, gpt-5, o1/o3/o4), and to Groq only when `GROQ_VISION_MODEL` is set.
   DeepSeek never receives images.
3. Server, network and empty-response failures get one retry on the same provider.
   Rate limits and timeouts move straight to the next provider. Auth failures disable that provider
   for the rest of the call.
4. Total budget is 105 s (`AI_TOTAL_BUDGET_MS`). Per-attempt timeout comes from the task (`AI_TIMEOUT_MS` overrides).
5. JSON is repaired, validated by the normalizer and a Zod contract (`lib/ai-schemas.ts`), and re-asked
   on a different provider if unusable.
6. One log line per call: task, ok, provider, model, ms, fallbacks, failure categories.
   Keys, prompts and provider error bodies are never logged.

## Daily allowance: `lib/ai-quota.ts`
20 free requests per user per day, counted atomically by `increment_ai_usage` (migration 0006).
A personal Groq key is not trusted until a provider accepts it. When the allowance is spent,
a request with a key may use only that key.

## Environment
`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` (all optional, at least one needed),
`GEMINI_MODEL`, `GROQ_MODEL`, `OPENAI_MODEL`, `DEEPSEEK_MODEL`, `GROQ_VISION_MODEL`,
`AI_PROVIDER_ORDER` (operator override for every task), `AI_TIMEOUT_MS`, `AI_TOTAL_BUDGET_MS`.
DeepSeek is preferred for routine text tasks (`mnemonic`, `shortcut`, `study_plan`) only when its key is set.
It sends the prompt to a separate third-party API.

## Tests
`tests/ai/` mocks `fetch` and Supabase, so no API credits are spent. Run `npm test`.
