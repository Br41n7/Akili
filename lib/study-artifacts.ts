/**
 * Study guide and slide deck: types, prompts and plain-text export.
 * Pure functions (no React, no Supabase) so they can be tested directly.
 */
import { MAX_SLIDES, MIN_SLIDES } from '@/lib/ai-schemas';
import type { KnowledgeGraph, MindMap } from '@/lib/concept-maps';
import type { Battle } from '@/lib/snap';

export type ArtifactKind = 'study_guide' | 'slide_deck' | 'mind_map' | 'knowledge_graph' | 'concept_battle';
export const ARTIFACT_KINDS: ArtifactKind[] = ['study_guide', 'slide_deck', 'mind_map', 'knowledge_graph', 'concept_battle'];

export interface Definition { term: string; meaning: string }
export interface Formula { name: string; latex: string; explanation: string; variables: { symbol: string; meaning: string }[] }

export interface StudyGuide {
  title: string;
  overview: string;
  sections: { heading: string; summary: string; key_points: string[]; definitions: Definition[]; formulas: Formula[]; examples: string[]; exam_tips: string[] }[];
  quick_revision: string[];
  common_mistakes: string[];
}

export interface SlideDeck {
  title: string;
  subtitle: string;
  slides: { title: string; bullets: string[]; speaker_notes: string; visual_hint: string }[];
}

export interface StoredArtifact { id: string; kind: ArtifactKind; title: string; content: StudyGuide | SlideDeck | MindMap | KnowledgeGraph | Battle; created_at: string }

export const SLIDE_PRESETS = [5, 8, 12, 15];
export const DEFAULT_SLIDES = 8;
export { MIN_SLIDES, MAX_SLIDES };

export function clampSlides(raw: unknown, fallback = DEFAULT_SLIDES): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, Math.trunc(n)));
}

interface PromptBase { topic: string; context: string; adaptive?: unknown }

const SOURCE = (i: PromptBase) => i.context
  ? `Base everything on this material. Do not add topics it does not cover.\n"""\n${i.context}\n"""`
  : 'No material was supplied; use the standard syllabus for the learner’s level and say nothing you are unsure of.';

export function buildStudyGuidePrompt(i: PromptBase): string {
  return `Write a study guide${i.topic ? ` on "${i.topic}"` : ' covering the main topics'} for revision.
${SOURCE(i)}
${i.adaptive ? `Learner context (evidence, not absolute truth): ${JSON.stringify(i.adaptive)}\nGive extra attention to weak concepts.` : ''}

Requirements:
- 3 to 8 sections in a sensible learning order. Each section: a short summary, key points, and only where the material supports them: definitions, formulas, short examples and exam tips. Use an empty array for anything not supported. Never add filler.
- Formulas: "latex" is bare TeX with no $ or \\( delimiters, e.g. "F = ma"; list each symbol in "variables". Do not invent formulas.
- Finish with "quick_revision" (the 5 to 10 facts to remember the night before) and "common_mistakes".
- Plain, exact language suited to the learner's level.

Return JSON only:
{"title": string, "overview": string, "sections": [{"heading": string, "summary": string, "key_points": [string], "definitions": [{"term": string, "meaning": string}], "formulas": [{"name": string, "latex": string, "explanation": string, "variables": [{"symbol": string, "meaning": string}]}], "examples": [string], "exam_tips": [string]}], "quick_revision": [string], "common_mistakes": [string]}`;
}

export function buildSlideDeckPrompt(i: PromptBase & { count: number }): string {
  const n = clampSlides(i.count);
  return `Create a slide deck${i.topic ? ` on "${i.topic}"` : ' covering the main topics'} for teaching or revising.
${SOURCE(i)}

Requirements:
- Exactly ${n} slides: the first introduces the topic, the last summarises it, the rest teach one idea each in a logical order.
- Each slide: a short title, 3 to 5 bullets (each under 15 words, no full paragraphs), "speaker_notes" of two to four sentences that explain the slide, and "visual_hint" (one sentence describing a helpful diagram or image, or an empty string).
- Only facts from the material or standard syllabus. No filler slides.

Return JSON only:
{"title": string, "subtitle": string, "slides": [{"title": string, "bullets": [string], "speaker_notes": string, "visual_hint": string}]}`;
}

// ── Plain-text export (Markdown) ─────────────────────────────────────────────

const bullets = (items: string[]) => items.map(i => `- ${i}`).join('\n');

export function guideToMarkdown(g: StudyGuide): string {
  const out: string[] = [`# ${g.title}`];
  if (g.overview) out.push(g.overview);
  for (const s of g.sections) {
    out.push(`## ${s.heading}`);
    if (s.summary) out.push(s.summary);
    if (s.key_points.length) out.push(bullets(s.key_points));
    if (s.definitions.length) out.push('**Definitions**\n\n' + s.definitions.map(d => `- **${d.term}**: ${d.meaning}`).join('\n'));
    for (const f of s.formulas) {
      out.push(`**${f.name || 'Formula'}**\n\n$$${f.latex}$$` + (f.explanation ? `\n\n${f.explanation}` : '') + (f.variables.length ? '\n\n' + f.variables.map(v => `- ${v.symbol}: ${v.meaning}`).join('\n') : ''));
    }
    if (s.examples.length) out.push('**Examples**\n\n' + bullets(s.examples));
    if (s.exam_tips.length) out.push('**Exam tips**\n\n' + bullets(s.exam_tips));
  }
  if (g.common_mistakes.length) out.push('## Common mistakes\n\n' + bullets(g.common_mistakes));
  if (g.quick_revision.length) out.push('## Quick revision\n\n' + bullets(g.quick_revision));
  return out.join('\n\n') + '\n';
}

export function deckToMarkdown(d: SlideDeck): string {
  const out: string[] = [`# ${d.title}`];
  if (d.subtitle) out.push(`_${d.subtitle}_`);
  d.slides.forEach((s, i) => {
    out.push(`## Slide ${i + 1}: ${s.title}\n\n${bullets(s.bullets)}` + (s.speaker_notes ? `\n\n> ${s.speaker_notes}` : '') + (s.visual_hint ? `\n\n_Visual: ${s.visual_hint}_` : ''));
  });
  return out.join('\n\n') + '\n';
}

export function fileNameFor(title: string, ext = 'md'): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'akili';
  return `${base}.${ext}`;
}
