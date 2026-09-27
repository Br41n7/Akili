import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';

const GROQ_TASKS = ['course_builder', 'study_guide', 'slide_deck', 'mnemonic', 'shortcut'];
const GEMINI_TASKS = ['living_concept', 'snap_solve', 'quiz', 'exam', 'concept_battle', 'research_validator', 'storyboard', 'notebook', 'confusion', 'topic_analysis', 'adaptive_quiz', 'adaptive_analysis', 'adaptive_tutor', 'diagram_question'];

export interface AIOptions {
  task: string;
  prompt: string;
  system: string;
  format?: 'json' | 'text';
  image?: { base64: string; mimeType: string };
  userGroqKey?: string;
  providerOrder?: string[];
}

function configuredOrder(preferred?: string[]) {
  const envOrder = (process.env.AI_PROVIDER_ORDER || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return preferred?.length ? preferred : envOrder.length ? envOrder : ['gemini', 'groq', 'openai', 'deepseek'];
}

async function openAICompatible(baseUrl: string, key: string, model: string, opts: AIOptions) {
  const content: any[] = [{ type: 'text', text: opts.prompt }];
  if (opts.image) content.push({ type: 'image_url', image_url: { url: `data:${opts.image.mimeType};base64,${opts.image.base64}` } });
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.image ? content : opts.prompt }], temperature: 0.7, max_tokens: 8000, ...(opts.format === 'json' ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!response.ok) throw new Error(`${model}: ${response.status} ${await response.text()}`);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text?.trim()) throw new Error('Empty response');
  return text;
}

export async function runAI(opts: AIOptions): Promise<string> {
  const { task, prompt, system, format, image, userGroqKey } = opts;
  const defaultOrder = image || GEMINI_TASKS.includes(task) ? ['gemini', 'openai', 'deepseek', 'groq'] : (GROQ_TASKS.includes(task) ? ['groq', 'gemini', 'openai', 'deepseek'] : configuredOrder());
  const providerOrder = configuredOrder(opts.providerOrder || defaultOrder);
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
        const res = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash', contents, config: { systemInstruction: system, responseMimeType: format === 'json' ? 'application/json' : undefined } });
        if (!res.text?.trim()) throw new Error('Empty response from Gemini');
        return res.text;
      }
      if (provider === 'groq') {
        const key = userGroqKey || process.env.GROQ_API_KEY;
        if (!key || image) { errors.push(key ? 'Groq: no vision support' : 'Groq: no key'); continue; }
        const groq = new Groq({ apiKey: key });
        const completion = await groq.chat.completions.create({ model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], response_format: format === 'json' ? { type: 'json_object' } : undefined, max_tokens: 8000, temperature: 0.7 });
        const text = completion.choices[0]?.message?.content;
        if (!text?.trim()) throw new Error('Empty response from Groq');
        return text;
      }
      if (provider === 'openai') {
        const key = process.env.OPENAI_API_KEY;
        if (!key) { errors.push('OpenAI: no OPENAI_API_KEY'); continue; }
        return await openAICompatible('https://api.openai.com/v1', key, process.env.OPENAI_MODEL || 'gpt-4o-mini', opts);
      }
      if (provider === 'deepseek') {
        const key = process.env.DEEPSEEK_API_KEY;
        if (!key) { errors.push('DeepSeek: no DEEPSEEK_API_KEY'); continue; }
        return await openAICompatible(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1', key, process.env.DEEPSEEK_MODEL || 'deepseek-chat', opts);
      }
    } catch (err: any) {
      errors.push(`${provider}: ${err.message}`);
      console.warn(`[AIFactory] ${provider} failed:`, err.message);
    }
  }
  throw new Error(`All AI providers failed:\n${errors.join('\n')}`);
}

export function stripFences(text: string): string { return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim(); }
export function isRelevant(prompt: string, response: string, minRatio = 0.1): boolean {
  const stopWords = new Set(['the','a','and','is','of','to','in','it','that','for','on','with','as','at']);
  const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w)));
  const pw = words(prompt); if (!pw.size) return true; const rw = words(response); let matches = 0; for (const w of pw) if (rw.has(w)) matches++; return (matches / pw.size) >= minRatio;
}
export async function runAIWithRetry(opts: AIOptions, validate?: (text: string) => { ok: boolean; error?: string }): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await runAI(attempt === 1 ? opts : { ...opts, prompt: `STRICT: Return ONLY valid JSON. No markdown. No preamble.\n\n${opts.prompt}` });
    const clean = opts.format === 'json' ? stripFences(raw) : raw;
    if (validate) { const result = validate(clean); if (!result.ok) { if (attempt === 2) throw new Error(`AI output invalid after 2 attempts: ${result.error}`); continue; } }
    if (opts.prompt && !isRelevant(opts.prompt, clean)) { if (attempt === 2) throw new Error('AI response failed relevance check'); continue; }
    return clean;
  }
  throw new Error('AI generation failed');
}
