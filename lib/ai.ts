import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';

// Tasks routed to Groq+Llama (long structured content)
const GROQ_TASKS = ['course_builder', 'study_guide', 'slide_deck', 'mnemonic', 'shortcut'];

// Tasks routed to Gemini (vision, reasoning, analysis)
const GEMINI_TASKS = ['living_concept', 'snap_solve', 'quiz', 'exam', 'concept_battle', 'research_validator', 'storyboard', 'notebook', 'confusion', 'topic_analysis'];

export interface AIOptions {
  task: string;
  prompt: string;
  system: string;
  format?: 'json' | 'text';
  image?: { base64: string; mimeType: string };
  userGroqKey?: string;
}

export async function runAI(opts: AIOptions): Promise<string> {
  const { task, prompt, system, format, image, userGroqKey } = opts;

  // Vision always needs Gemini
  const useGeminiFirst = !!image || GEMINI_TASKS.includes(task);
  const providerOrder = useGeminiFirst ? ['gemini', 'groq'] : ['groq', 'gemini'];

  const errors: string[] = [];

  for (const provider of providerOrder) {
    try {
      if (provider === 'gemini') {
        const key = process.env.GEMINI_API_KEY;
        if (!key) { errors.push('Gemini: no GEMINI_API_KEY'); continue; }

        const ai = new GoogleGenAI({ apiKey: key });
        const contents: any[] = [];
        if (image) contents.push({ inlineData: { data: image.base64, mimeType: image.mimeType } });
        contents.push(prompt);

        const res = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents,
          config: {
            systemInstruction: system,
            responseMimeType: format === 'json' ? 'application/json' : undefined,
          },
        });

        const text = res.text;
        if (!text?.trim()) throw new Error('Empty response from Gemini');
        return text;
      }

      if (provider === 'groq') {
        const key = userGroqKey || process.env.GROQ_API_KEY;
        if (!key) { errors.push('Groq: no key'); continue; }
        if (image) { errors.push('Groq: no vision support'); continue; }

        const groq = new Groq({ apiKey: key });
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          response_format: format === 'json' ? { type: 'json_object' } : undefined,
          max_tokens: 8000,
          temperature: 0.7,
        });

        const text = completion.choices[0]?.message?.content;
        if (!text?.trim()) throw new Error('Empty response from Groq');
        return text;
      }
    } catch (err: any) {
      errors.push(`${provider}: ${err.message}`);
      console.warn(`[AIFactory] ${provider} failed:`, err.message);
    }
  }

  throw new Error(`All AI providers failed:\n${errors.join('\n')}`);
}

// Strip markdown fences before JSON.parse
export function stripFences(text: string): string {
  return text
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '').trim();
}

// Anti-hallucination: check response actually relates to prompt
export function isRelevant(prompt: string, response: string, minRatio = 0.1): boolean {
  const stopWords = new Set(['the','a','and','is','of','to','in','it','that','for','on','with','as','at']);
  const words = (t: string) => new Set(
    t.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
  );
  const pw = words(prompt);
  if (!pw.size) return true;
  const rw = words(response);
  let matches = 0;
  for (const w of pw) if (rw.has(w)) matches++;
  return (matches / pw.size) >= minRatio;
}

// Run with one automatic retry on validation failure
export async function runAIWithRetry(
  opts: AIOptions,
  validate?: (text: string) => { ok: boolean; error?: string }
): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await runAI(attempt === 1 ? opts : {
      ...opts,
      prompt: `STRICT: Return ONLY valid JSON. No markdown. No preamble.\n\n${opts.prompt}`,
    });

    const clean = opts.format === 'json' ? stripFences(raw) : raw;

    if (validate) {
      const result = validate(clean);
      if (!result.ok) {
        if (attempt === 2) throw new Error(`AI output invalid after 2 attempts: ${result.error}`);
        console.warn(`[AI] Attempt ${attempt} failed validation: ${result.error}. Retrying...`);
        continue;
      }
    }

    if (opts.prompt && !isRelevant(opts.prompt, clean)) {
      if (attempt === 2) throw new Error('AI response failed relevance check');
      continue;
    }

    return clean;
  }
  throw new Error('AI generation failed');
}
