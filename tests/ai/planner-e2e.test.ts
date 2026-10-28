import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockProviders, setEnv } from './helpers';
import { PLANNER_SYSTEM, buildPlannerPrompt } from '@/lib/visual/planner';
import { validateVisualDecision } from '@/lib/visual/schema';

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '44444444-4444-4444-8444-444444444444';
const db: Record<string, any[]> = {
  projects: [{ id: PROJECT, user_id: USER, name: 'Biology', education_level: 'secondary' }],
  profiles: [{ id: USER, region_context: {} }], ai_usage: [],
};
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }) }));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from(table: string) {
      const f: [string, unknown][] = [];
      const b: any = { select: () => b, eq: (c: string, v: unknown) => { f.push([c, v]); return b; }, maybeSingle: async () => ({ data: (db[table] || []).find(r => f.every(([c, v]) => r[c] === v)) ?? null, error: null }), upsert: async () => ({ error: null }) };
      return b;
    },
    rpc: async () => ({ data: 1, error: null }),
  },
}));

// What a real model tends to return for a school lesson: plain JSON, a long-ish label, no learning_goal.
const MODEL_OUTPUT = JSON.stringify({
  needs_visual: true, visual_reason: 'Shows inputs and outputs in order.', visual_type: 'process', subject: 'other',
  topic: 'Photosynthesis', title: 'How photosynthesis works',
  elements: [
    { id: 'light', label: 'Light energy absorbed by chlorophyll in the thylakoid membranes of the chloroplast', description: 'Sunlight drives the light reactions.' },
    { id: 'co2', label: 'Carbon dioxide', description: 'Enters the leaf through the stomata.' },
    { id: 'glucose', label: 'Glucose', description: 'The sugar made in the Calvin cycle.' },
  ],
  relationships: [{ from: 'light', relation: 'leads_to', to: 'glucose' }, { from: 'co2', relation: 'leads_to', to: 'glucose' }],
  sequence: ['light', 'co2', 'glucose'], interactions: ['select'],
});

beforeEach(() => { for (const m of ['info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function planner() {
  setEnv({ GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' });
  const net = mockProviders({ gemini: [{ text: MODEL_OUTPUT }] });
  vi.resetModules();
  const { POST } = await import('@/app/api/ai/generate/route');
  // The same body requestLessonVisual sends.
  const body = {
    task: 'visual_planner', prompt: buildPlannerPrompt({ title: 'Photosynthesis', content: 'Plants use light, carbon dioxide and water in the chloroplast.' }),
    systemInstruction: PLANNER_SYSTEM, persona: 'planner', region: 'Nigeria', projectId: PROJECT, validationType: 'visual_spec', format: 'json',
  };
  const res = await POST(new NextRequest('http://localhost/api/ai/generate', { method: 'POST', body: JSON.stringify(body) }));
  return { res, json: await res.json(), net };
}

describe('lesson diagram, end to end with a mocked model', () => {
  it('returns a diagram the client accepts, including a model reply with a long label and no learning_goal', async () => {
    const { res, json } = await planner();
    expect(res.status).toBe(200);
    const decision = validateVisualDecision(JSON.parse(json.result));
    expect(decision.ok).toBe(true);
    if (decision.ok && decision.data.needs_visual) {
      expect(decision.data.spec.elements).toHaveLength(3);
      expect(decision.data.spec.elements[0].label.length).toBeLessThanOrEqual(60);
      expect(decision.data.spec.learning_goal).toBeTruthy();
    }
  });

  it('gives the model the JSON-only planner voice, not the tutor persona', async () => {
    const { net } = await planner();
    const system: string = net.calls[0].body.systemInstruction.parts[0].text;
    expect(system).toContain('precise JSON-producing planner');
    expect(system).toContain('educational visual planner');
    expect(system).not.toContain('curious 12-year-old');
  });
});
