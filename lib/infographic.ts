/** One-page revision infographic: types, prompt, layout split and plain-text export. Pure functions. */

export interface InfoBullet { text: string; sub: string[] }
export interface InfoSection { heading: string; bullets: InfoBullet[] }
export interface Infographic {
  title: string; subtitle: string;
  sections: InfoSection[];
  key_points: string[];
  extra: { title: string; items: string[] } | null;
  /** A VisualSpec (validated again when rendered), or null. Added after generation, never by the text model. */
  figure?: unknown | null;
}

export const POSTER_WIDTH = 760;
export const INFO_LIMITS = { minSections: 3, maxSections: 8, maxBullets: 7 };

/** Soft section colours, in order, like a hand-made study sheet. Text on all of them is dark ink. */
export const SECTION_COLORS = ['#FBD5E4', '#CFE3FA', '#D8EFC4', '#E3D5F7', '#FDF0B0', '#FAD9BE', '#C9EDEA', '#E4E7EE'];
export const sectionColor = (i: number) => SECTION_COLORS[i % SECTION_COLORS.length];

export function buildInfographicPrompt(i: { topic: string; context: string }): string {
  return `Make a one-page revision infographic${i.topic ? ` on "${i.topic}"` : ' on the main topic'}.
${i.context ? `Base it only on this material:\n"""\n${i.context}\n"""` : 'No material was supplied; use the standard syllabus and leave out anything you are unsure of.'}

It will be shown as a poster, so it must be SHORT and scannable:
- ${3}-${8} numbered sections in a learning order (for a body structure: type, surfaces, capsule, ligaments, movements, nerve supply; for a process: stages in order). Each heading is 1 to 4 words.
- Each section has 2 to 6 bullets of at most 12 words, a few with up to 2 short sub-bullets. Numbers, ranges and names only if you are sure they are correct.
- "key_points": 3 to 5 facts to remember.
- "extra": one more box that fits the topic, with a short title such as "Common conditions", "Common mistakes" or "Exam tips", and 3 to 5 items. Use null if nothing fits.
- Write maths in plain text. No markdown.

Return JSON only:
{"title": string, "subtitle": string, "sections": [{"heading": string, "bullets": [{"text": string, "sub": [string]}]}], "key_points": [string], "extra": {"title": string, "items": [string]} | null}`;
}

/** Everything the text model wrote, as one string (used to decide on a figure and to ask for it). */
export function infographicText(g: Infographic): string {
  return [g.title, g.subtitle, ...g.sections.flatMap(s => [s.heading, ...s.bullets.flatMap(b => [b.text, ...b.sub])]), ...g.key_points].filter(Boolean).join('\n');
}

const weight = (s: InfoSection) => 1.5 + s.bullets.reduce((n, b) => n + 1 + b.sub.length * 0.6, 0);
const FIGURE_WEIGHT = 12;

/**
 * Two poster columns, sections kept in reading order. The right column starts with the figure (when
 * there is one) and ends with key points and the extra box; the split is the one that leaves the two
 * columns closest in height.
 */
export function splitSections(sections: InfoSection[], hasFigure: boolean, keyPoints = 4, extraItems = 4): { left: number[]; right: number[] } {
  const w = sections.map(weight);
  const fixedRight = (hasFigure ? FIGURE_WEIGHT : 0) + (keyPoints ? 1.5 + keyPoints * 1.4 : 0) + (extraItems ? 1.5 + extraItems : 0);
  let best = 1, bestGap = Infinity;
  for (let k = 1; k <= sections.length; k++) {
    const left = w.slice(0, k).reduce((a, b) => a + b, 0);
    const right = w.slice(k).reduce((a, b) => a + b, 0) + fixedRight;
    const gap = Math.abs(left - right);
    if (gap < bestGap) { bestGap = gap; best = k; }
  }
  const idx = sections.map((_, i) => i);
  return { left: idx.slice(0, best), right: idx.slice(best) };
}

export function infographicToMarkdown(g: Infographic): string {
  const out = [`# ${g.title}`];
  if (g.subtitle) out.push(`_${g.subtitle}_`);
  g.sections.forEach((s, i) => {
    out.push(`## ${i + 1}. ${s.heading}`);
    out.push(s.bullets.map(b => `- ${b.text}` + b.sub.map(t => `\n  - ${t}`).join('')).join('\n'));
  });
  if (g.key_points.length) out.push('## Key points\n\n' + g.key_points.map(k => `- ${k}`).join('\n'));
  if (g.extra) out.push(`## ${g.extra.title}\n\n` + g.extra.items.map(k => `- ${k}`).join('\n'));
  return out.join('\n\n') + '\n';
}
