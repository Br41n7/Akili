/** Confusion recovery and quick-method (shortcut) helpers: types and prompts. Pure. */

export interface ConfusionHelp {
  likely_confusion: string; simple_explanation: string; analogy: string;
  steps: { title: string; text: string }[];
  check: { question: string; answer: string };
  if_still_stuck: string;
}
export interface ShortcutSet {
  topic: string;
  methods: { name: string; when_to_use: string; steps: string[]; example: { problem: string; working: string[]; answer: string }; watch_out: string }[];
}

const CTX = (c: string) => c ? `Learner's material (use its terms and notation):\n"""\n${c}\n"""` : '';
const PLAIN = 'Write maths in plain text (for example 3x + 2 = 11, x^2, sqrt(16)); no LaTeX, no markdown.';

export function buildConfusionPrompt(i: { topic: string; stuck: string; attempt?: number; context: string }): string {
  return `A learner is confused about: "${i.topic}".
${i.stuck ? `What they say they do not understand: "${i.stuck}"` : ''}
${i.attempt && i.attempt > 1 ? `This is explanation number ${i.attempt}. Their earlier explanations did not work, so take a clearly DIFFERENT angle and a different analogy; do not repeat yourself.` : ''}
${CTX(i.context)}

First work out the most likely misconception, then explain it so a beginner can follow.
- "likely_confusion": one or two sentences naming what is probably going wrong.
- "simple_explanation": plain language, under 120 words, no jargon without a definition.
- "analogy": one everyday picture from a Nigerian student's life. It must be accurate, not just cute.
- "steps": 3 to 5 small steps, each with a short title and text.
- "check": one question they can answer to test themselves, with its answer.
- "if_still_stuck": one specific thing to try next.
Only state facts you are sure of. ${PLAIN}

Return JSON only:
{"likely_confusion": string, "simple_explanation": string, "analogy": string, "steps": [{"title": string, "text": string}], "check": {"question": string, "answer": string}, "if_still_stuck": string}`;
}

export function buildShortcutPrompt(i: { topic: string; context: string }): string {
  return `Give quick, correct methods for solving "${i.topic}" questions faster in an exam.
${CTX(i.context)}

Rules:
- 1 to 3 methods. Each must be mathematically valid for the cases stated in "when_to_use"; never give a trick that only works by accident.
- Each method: a name, when_to_use (including the cases where it does NOT apply), 2 to 5 steps, one fully worked example whose "answer" you have checked, and "watch_out" naming the commonest slip.
- Prefer methods taught in standard syllabuses; say so if a method is not examinable working.
${PLAIN}

Return JSON only:
{"topic": string, "methods": [{"name": string, "when_to_use": string, "steps": [string], "example": {"problem": string, "working": [string], "answer": string}, "watch_out": string}]}`;
}

export const confusionToText = (c: ConfusionHelp) =>
  [c.likely_confusion, c.simple_explanation, `Think of it like this: ${c.analogy}`, ...c.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.text}`), `Check: ${c.check.question}`, `Answer: ${c.check.answer}`].filter(Boolean).join('\n\n');

export const shortcutToText = (s: ShortcutSet) =>
  [`${s.topic}`, ...s.methods.map(m => [`${m.name}`, `Use when: ${m.when_to_use}`, ...m.steps.map((t, i) => `${i + 1}. ${t}`), `Example: ${m.example.problem}`, ...m.example.working, `Answer: ${m.example.answer}`, `Watch out: ${m.watch_out}`].join('\n'))].join('\n\n');
