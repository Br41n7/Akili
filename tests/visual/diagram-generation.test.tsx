import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PLANNER_SYSTEM, shouldConsiderVisual } from '@/lib/visual/planner';
import { fit, parseVisualSpec, validateVisualDecision } from '@/lib/visual/schema';
import { PERSONA_IDS } from '@/lib/ai-tasks';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('which lessons get a diagram request', () => {
  const lessons: Record<string, string> = {
    Photosynthesis: 'Photosynthesis is how green plants make food using light, carbon dioxide and water in the chloroplasts. The light reactions and the Calvin cycle are the two stages.',
    'Newton’s laws': 'Newton’s second law says force equals mass times acceleration. A force changes the velocity of a body, and momentum is conserved.',
    'Atomic structure': 'An atom has a nucleus of protons and neutrons with electrons in shells. Isotopes differ in neutrons.',
    'Supply and demand': 'The supply and demand curves meet at equilibrium. A rise in price lowers demand.',
    'The water cycle': 'Water evaporates, condenses into clouds and returns as rainfall. The cycle repeats.',
    'The human heart': 'The heart has four chambers: two atria and two ventricles, with valves between them. The structure pumps blood to the lungs.',
    'Biceps brachii': 'The biceps brachii originates at the scapula and inserts on the radius, innervated by the musculocutaneous nerve.',
  };
  it.each(Object.entries(lessons))('%s is sent to the planner', (title, body) => {
    expect(shouldConsiderVisual(`${title}\n${body}`).consider).toBe(true);
  });

  it('still skips lessons with no science or structure content', () => {
    expect(shouldConsiderVisual('The Treaty of Versailles\nIt was signed in 1919 and ended the war with Germany.').consider).toBe(false);
  });

  it('keeps the clinical subject hint for clinical lessons and "other" for school science', () => {
    expect(shouldConsiderVisual(lessons['Biceps brachii']).subject).toBe('anatomy');
    expect(shouldConsiderVisual(lessons['Newton’s laws']).subject).toBe('other');
  });
});

describe('a usable diagram is not rejected for cosmetic reasons', () => {
  const base = (over: object = {}) => ({
    needs_visual: true, visual_type: 'process', subject: 'other', topic: 'Photosynthesis', title: 'Photosynthesis overview',
    learning_goal: 'Understand photosynthesis',
    elements: [{ id: 'light', label: 'Light energy', description: 'Sunlight.' }, { id: 'glucose', label: 'Glucose', description: 'Sugar.' }],
    relationships: [{ from: 'light', relation: 'leads_to', to: 'glucose' }], sequence: ['light', 'glucose'], ...over,
  });

  it('fills a missing topic, title or learning goal from what the model did give', () => {
    const d = validateVisualDecision(base({ learning_goal: undefined, topic: undefined }));
    expect(d.ok).toBe(true);
    if (d.ok && d.data.needs_visual) {
      expect(d.data.spec.topic).toBe('Photosynthesis overview');
      expect(d.data.spec.learning_goal).toBe('Understand Photosynthesis overview');
    }
  });

  it('shortens long text at a word boundary instead of rejecting', () => {
    const long = 'Light energy absorbed by the chlorophyll pigments in the thylakoid membranes of the chloroplast';
    const d = validateVisualDecision(base({ elements: [{ id: 'light', label: long }, { id: 'glucose', label: 'Glucose' }] }));
    expect(d.ok).toBe(true);
    if (d.ok && d.data.needs_visual) {
      const label = d.data.spec.elements[0].label;
      expect(label.length).toBeLessThanOrEqual(60);
      expect(label.endsWith('…')).toBe(true);
      expect(long.startsWith(label.slice(0, -1))).toBe(true);
    }
    expect(fit('short', 60)).toBe('short');
  });

  it('trims extra elements and steps, and repairs element symbols', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, label: `E${i}` }));
    const d = parseVisualSpec(base({ elements: many, relationships: [], sequence: [] }));
    expect(d.ok && d.data.elements.length).toBe(24);
    const mol = parseVisualSpec(base({ visual_type: 'molecular_structure', elements: [{ id: 'ca', label: 'Alpha carbon', symbol: 'Cα' }, { id: 'n', label: 'Nitrogen', symbol: 'N' }], relationships: [{ from: 'ca', relation: 'bonded_to', to: 'n' }], sequence: [] }));
    expect(mol.ok && mol.data.elements[0].symbol).toBe('C');
    const junk = parseVisualSpec(base({ elements: [{ id: 'a', label: 'A', symbol: '??' }, { id: 'b', label: 'B' }] }));
    expect(junk.ok && junk.data.elements[0].symbol).toBeUndefined();
  });

  it('still rejects what is scientifically wrong or unusable', () => {
    expect(validateVisualDecision(base({ elements: [{ id: 'only', label: 'One' }], relationships: [], sequence: [] })).ok).toBe(false);
    expect(validateVisualDecision(base({ elements: [{ id: 'a', label: 'A', description: 'see https://evil.test/x' }, { id: 'b', label: 'B' }], relationships: [], sequence: [] })).ok).toBe(false);
    const carbon5 = base({
      visual_type: 'molecular_structure',
      elements: [{ id: 'c', label: 'C', symbol: 'C' }, ...['h1', 'h2', 'h3', 'h4', 'h5'].map(id => ({ id, label: id, symbol: 'H' }))],
      relationships: ['h1', 'h2', 'h3', 'h4', 'h5'].map(to => ({ from: 'c', relation: 'bonded_to', to })), sequence: [],
    });
    expect(validateVisualDecision(carbon5).ok).toBe(false);
  });
});

describe('server and client validate the same decision', () => {
  const flat = {
    needs_visual: true, visual_reason: 'Order matters.', visual_type: 'process', topic: 'T', title: 'T', learning_goal: 'g',
    elements: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], relationships: [{ from: 'a', relation: 'leads_to', to: 'b' }], sequence: ['a', 'b'],
  };

  it('REGRESSION: what the server returns passes the client validation unchanged', () => {
    const server = validateVisualDecision(flat);
    expect(server.ok).toBe(true);
    const wire = JSON.parse(JSON.stringify(server.ok ? server.data : null)); // what crosses the network
    const client = validateVisualDecision(wire);
    expect(client.ok).toBe(true);
    if (client.ok && client.data.needs_visual) expect(client.data.spec.elements).toHaveLength(2);
  });

  it('is stable when validated any number of times', () => {
    let current: unknown = flat;
    for (let i = 0; i < 3; i++) {
      const r = validateVisualDecision(current);
      expect(r.ok).toBe(true);
      current = r.ok ? JSON.parse(JSON.stringify(r.data)) : null;
    }
  });

  it('keeps "no diagram needed" decisions intact', () => {
    const r = validateVisualDecision({ needs_visual: false, visual_reason: 'Not spatial.' });
    expect(r).toEqual({ ok: true, data: { needs_visual: false, visual_reason: 'Not spatial.' } });
    expect(validateVisualDecision(JSON.parse(JSON.stringify((r as any).data)))).toEqual(r);
  });

  it('still rejects a spec nested under spec if it is invalid', () => {
    expect(validateVisualDecision({ needs_visual: true, spec: { visual_type: 'nonsense', elements: [] } }).ok).toBe(false);
  });
});

describe('planner request is accepted by the route', () => {
  it('keeps the planner system prompt under the route limit', () => {
    expect(PLANNER_SYSTEM.length).toBeLessThan(4000);
  });

  it('only sends personas the server knows (free-text personas are dropped by the route)', () => {
    const roots = ['lib', 'components', 'app'];
    const files: string[] = [];
    const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && files.push(p); } };
    roots.forEach(walk);
    const bad: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bpersona:\s*'([^']*)'/g)) {
        if (!(PERSONA_IDS as readonly string[]).includes(m[1])) bad.push(`${f}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('screens', () => {
  it('offers a manual diagram button on lessons the gate skips', async () => {
    const { default: LessonVisual } = await import('@/components/visual/LessonVisual');
    const lesson = { id: 'm1-l1', title: 'The Treaty of Versailles', content: 'It was signed in 1919.', key_concepts: [], learning_objectives: [] };
    const html = renderToStaticMarkup(<LessonVisual lesson={lesson} projectId="p" userId="u" region="Nigeria" persona="friendly" onPersist={() => {}} />);
    expect(html).toContain('Draw a diagram for this lesson');
  });

  it('renders nothing extra for a lesson the gate accepts while the request is still pending', async () => {
    const { default: LessonVisual } = await import('@/components/visual/LessonVisual');
    const lesson = { id: 'm1-l1', title: 'Photosynthesis', content: 'Plants use light, carbon dioxide and water in the chloroplast. The Calvin cycle is a stage.', key_concepts: ['chlorophyll'], learning_objectives: [] };
    const html = renderToStaticMarkup(<LessonVisual lesson={lesson} projectId="p" userId="u" region="Nigeria" persona="friendly" onPersist={() => {}} />);
    expect(html).not.toContain('Draw a diagram');
  });
});
