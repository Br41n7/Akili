/** SnapSolve (read a photographed question, then solve the confirmed text) and Concept Battle. Pure helpers. */

export const SNAP_MAX_SIDE = 1600;
export const SNAP_MAX_BYTES = 6 * 1024 * 1024;
export const SNAP_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type SnapMode = 'solve' | 'explain';

export interface SnapRead { question_text: string; diagram_description: string; subject_guess: string; legible: boolean; confidence: 'high' | 'medium' | 'low'; uncertain: string[] }
export interface SnapSolution { problem_type: string; concept: string; explanation: string; solution_steps: string[]; final_answer: string; shortcut_method: string; common_mistakes: string[] }

export const READ_SYSTEM = 'You are a careful transcriber of exam questions. Copy what is written, exactly. Never solve, never correct, never guess a word you cannot read.';

export const buildReadPrompt = () => `Transcribe the academic question in this picture.

- "question_text": every word, number, symbol and option, in reading order. Write maths in plain text (x^2, sqrt(16), 3/4). Keep option letters.
- "diagram_description": if there is a diagram, graph or figure, describe what it shows (labels, values, shapes) in plain words; otherwise an empty string.
- "uncertain": each word, number or symbol you are NOT sure you read correctly (for example "the exponent looks like 2 or 3"). Be honest; a wrong digit changes the answer.
- "confidence": high, medium or low for the whole transcription.
- "legible": false if the picture is too blurry, dark, cropped or is not a question. Then leave question_text empty.
- "subject_guess": the subject in one or two words.

Return JSON only:
{"question_text": string, "diagram_description": string, "subject_guess": string, "legible": boolean, "confidence": "high"|"medium"|"low", "uncertain": [string]}`;

export function buildSolvePrompt(i: { question: string; diagram: string; mode: SnapMode }): string {
  const solve = i.mode === 'solve';
  return `A learner has this exam question (it was read from a photo and checked by the learner):
"""
${i.question}
"""
${i.diagram ? `Diagram, described in words: ${i.diagram}\n` : ''}
Mode: ${solve ? 'SOLVE' : 'EXPLAIN ONLY'}
${solve
    ? '- Give a clear step-by-step solution that ends in the final answer. Check the arithmetic before you answer. If the question is missing information, say what is missing instead of guessing.\n- If a faster valid method exists, describe it in "shortcut_method"; otherwise leave it empty.'
    : '- Do NOT give the answer or the solution steps: leave "final_answer" and "solution_steps" empty. In "explanation", teach the concept, formulas and method the question tests, so the learner can solve it themselves, and end with a hint for the first step.'}
- "common_mistakes": 2 to 3 slips students make on this kind of question.
Write maths in plain text (x^2, sqrt(16)). Only state facts you are sure of.

Return JSON only:
{"problem_type": string, "concept": string, "explanation": string, "solution_steps": [string], "final_answer": string, "shortcut_method": string, "common_mistakes": [string]}`;
}

/** Scale to fit SNAP_MAX_SIDE without enlarging. */
export function fitSize(w: number, h: number, max = SNAP_MAX_SIDE): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: max, height: max };
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

export const dataUrlToBase64 = (url: string): string => url.slice(url.indexOf(',') + 1);

/** Why a file cannot be used, or null if it can. */
export function checkImageFile(f: { type: string; size: number }): string | null {
  if (!f.type.startsWith('image/')) return 'Choose a photo or screenshot (an image file).';
  if (f.size > 25 * 1024 * 1024) return 'That image is very large. Take a closer photo or crop it.';
  return null;
}

/** True when the learner should look closely at the transcription before solving. */
export const needsCareful = (r: Pick<SnapRead, 'confidence' | 'uncertain'>) => r.confidence !== 'high' || r.uncertain.length > 0;

export const solutionToText = (s: SnapSolution) =>
  [s.problem_type && `${s.problem_type}`, `Concept: ${s.concept}`, s.explanation, ...s.solution_steps.map((t, i) => `${i + 1}. ${t}`), s.final_answer && `Answer: ${s.final_answer}`].filter(Boolean).join('\n\n');

// ── Concept Battle ───────────────────────────────────────────────────────────
export interface Battle {
  title: string; concepts: [string, string];
  comparison: { feature: string; a: string; b: string }[]; analogy: string; scenario: string;
  rounds: { statement: string; answer: 'a' | 'b' | 'both' | 'neither'; explanation: string }[];
}

export function buildBattlePrompt(i: { a: string; b: string; context: string }): string {
  return `Run a "Concept Battle" between "${i.a}" and "${i.b}": help a learner tell two easily confused ideas apart.
${i.context ? `Use the learner's material for terms and scope:\n"""\n${i.context}\n"""` : ''}

- "concepts": exactly ["${i.a}", "${i.b}"], in that order.
- "comparison": 4 rows, each a feature both share and how they DIFFER on it ("feature", "concept1", "concept2").
- "analogy": one accurate picture that shows the difference. "scenario": a real situation where telling them apart matters.
- "rounds": 4 to 5 single statements the learner must classify. "answer" is "a" (only ${i.a}), "b" (only ${i.b}), "both", or "neither". Use at least one "a" and one "b", and make the statements specific facts, not opinions. "explanation" says why.
Only state facts you are sure of.

Return JSON only:
{"title": string, "concepts": [string, string], "comparison": [{"feature": string, "concept1": string, "concept2": string}], "analogy": string, "scenario": string, "rounds": [{"statement": string, "answer": "a"|"b"|"both"|"neither", "explanation": string}]}`;
}

export function battleToMarkdown(b: Battle): string {
  const out = [`# ${b.title}`, '', `| Feature | ${b.concepts[0]} | ${b.concepts[1]} |`, '| --- | --- | --- |', ...b.comparison.map(r => `| ${r.feature} | ${r.a} | ${r.b} |`), ''];
  if (b.analogy) out.push(`**Analogy:** ${b.analogy}`, '');
  if (b.scenario) out.push(`**When it matters:** ${b.scenario}`, '');
  return out.join('\n');
}

export function gradeBattle(b: Battle, picks: (string | null)[]): { correct: number; total: number } {
  return { correct: b.rounds.filter((r, i) => picks[i] === r.answer).length, total: b.rounds.length };
}
