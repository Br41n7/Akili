/**
 * Visual analysis step.
 *
 * Kept separate from the course prompt on purpose: the course prompt stays the
 * same size, and visuals are requested per lesson, on demand, and cached in the
 * lesson JSON. That matters because every AI request counts against the
 * learner's daily allowance (20 on the shared key).
 */
import { callAIJSON } from '@/lib/utils';
import { SUBJECTS, VISUAL_TYPES, validateVisualDecision, type VisualDecision, type VisualSubject } from './schema';
import { RELATION_KEYS } from './vocab';

// ── Cheap gate (no AI call) ─────────────────────────────────────────────────

const DOMAIN: Record<Exclude<VisualSubject, 'other'>, RegExp> = {
  anatomy: /\b(anatom|muscle|tendon|ligament|nerve|plexus|arter(?:y|ies)|vein|bone|joint|femur|humerus|tibia|fibula|radius|ulna|vertebra|skelet|fascia|dermis|epiderm|cartilage|innervat|origin|insertion|meniscus|patella|brachial)/gi,
  biochemistry: /\b(protein|amino acid|peptide|enzyme|substrate|glycoly|krebs|citric acid|atp|nadh|dna|rna|nucleotide|glucose|lipid|fatty acid|metabol|ribosome|transcription|translation|replication|mitochond|polypeptide|helix)/gi,
  physiology: /\b(action potential|synapse|neuron|hormone|feedback|cardiac|blood pressure|nephron|alveol|respirat|filtration|osmosis|diffusion|contraction|sarcomere|homeostasis|reflex)/gi,
  prosthetics_orthotics: /\b(orthosis|orthoses|prosthe|socket|amputation|gait|ankle-foot|afo|biomechanic|suspension|alignment|stance phase|swing phase)/gi,
  biomechanics: /\b(torque|moment arm|ground reaction|centre of mass|center of mass|joint angle|lever)/gi,
};
const STRUCTURE = /\b(stage|step|phase|cycle|pathway|mechanism|sequence|layer|level|structure|compare|versus|differ|process|formation|synthesis)/gi;

export interface GateResult { consider: boolean; subject: VisualSubject; domainHits: number }

/**
 * Decides whether the AI planner is worth a request. Deliberately generous: the
 * planner still has the final say via needs_visual. Lessons with no science or
 * structure vocabulary never cost a request.
 */
export function shouldConsiderVisual(text: string): GateResult {
  let best: VisualSubject = 'other';
  let bestHits = 0;
  let total = 0;
  for (const [subject, re] of Object.entries(DOMAIN) as [VisualSubject, RegExp][]) {
    const hits = new Set((text.match(re) || []).map(m => m.toLowerCase())).size;
    total += hits;
    if (hits > bestHits) { best = subject; bestHits = hits; }
  }
  const structure = new Set((text.match(STRUCTURE) || []).map(m => m.toLowerCase())).size;
  return { consider: total >= 3 || (total >= 1 && structure >= 1), subject: best, domainHits: total };
}

// ── Prompts ─────────────────────────────────────────────────────────────────

// Must stay under the route's 4000-character systemInstruction limit.
export const PLANNER_SYSTEM = `You are Akili's educational visual planner. Decide whether a visual would materially improve understanding of a lesson and, if so, describe it as structured JSON. You never draw. The app renders the diagram from your JSON.

RULES
- Use a visual only for: spatial relationships, anatomical structures, molecular structures, sequences, mechanisms, transformations, cycles, hierarchies, comparisons, layers, pathways, cause and effect. Otherwise return {"needs_visual": false, "visual_reason": "..."}.
- Never add a visual for decoration, or just because a noun appears.
- Scientific correctness beats completeness. Include only elements, relationships, bonds and facts that are standard textbook content and that you are certain of. If unsure, leave it out, or return needs_visual false.
- Stay consistent with the lesson. Do not invent details about the learner's course.
- Beginner: 3 to 8 elements. Otherwise at most 12. Every element needs a one-sentence plain-language description.
- Anatomy: prioritise spatial relationships and labels. Set "view" and "axes" (what each screen edge means, e.g. {"top":"superior","bottom":"inferior","left":"lateral","right":"medial"}), then give every element an integer "pos" so the layout agrees with each spatial relationship. Use at most 3 distinct x values. Put origin, insertion, action, innervation and blood supply in "attributes" when relevant. This is a simplified schematic, not artwork.
- Biochemistry: prioritise molecular structure, mechanisms, pathways and transformations. For molecules use functional-group or component elements unless it is a small molecule where every atom and bond is certain; atoms need "symbol" and bonds need "bond_order".
- Process, cycle, flowchart, timeline, hierarchy, layers: list element ids in "sequence" order and link them with relationships.
- Anatomy origin/insertion: link the muscle to the bone with attaches_to and "role": "origin" or "insertion" (from = muscle, to = bone). Put the muscle's Action, Innervation and Blood supply in "attributes" and also link nerve and artery with innervated_by / supplied_by when shown.
- Depth: use superficial_to / deep_to (or anterior_to / posterior_to with the correct "view") when one structure lies in front of another.
- Cross_section: list layers outer to inner in "sequence". Place a structure inside a layer with "section": {"ring": layer id, "angle": 0-359 (0 = top, clockwise), "span": 10-180}. Say what top/bottom/left/right mean in "axes". Wedges in one layer must not overlap.
- Mechanism: give "steps" (title, text, elements) describing what changes at each stage.
- Comparison: at most 4 items, each with the same attribute names.
- Set interactions explicitly: always include "select"; add "toggle_labels" when hiding labels is educational, "reveal_layers" for layered anatomy, and "step_through" for mechanisms where step-by-step viewing helps.
- For anatomy, if multiple clinically useful views are necessary, include view_variants with each alternate view's axes and element positions. Never invent a second view merely for decoration.
- Output a single JSON object only. No HTML, CSS, JavaScript, markdown, URLs or prose outside the JSON. Ids are lowercase_snake_case.`;

export const PLANNER_PERSONA = 'You are a precise JSON-producing planner. You do not chat.';

export interface PlannerInput {
  title: string;
  content: string;
  objectives?: string[];
  keyConcepts?: string[];
  level?: string;
  subjectHint?: VisualSubject;
  /** Learner has struggled with this concept: produce a simpler visual. */
  simplify?: boolean;
  weakConcepts?: string[];
}

export function buildPlannerPrompt(i: PlannerInput): string {
  const lines = [
    `Lesson title: ${i.title}`,
    i.subjectHint && i.subjectHint !== 'other' ? `Likely subject: ${i.subjectHint}` : '',
    i.level ? `Learner level: ${i.level}` : '',
    i.objectives?.length ? `Learning objectives:\n- ${i.objectives.join('\n- ')}` : '',
    i.keyConcepts?.length ? `Key concepts: ${i.keyConcepts.join(', ')}` : '',
    i.weakConcepts?.length ? `The learner has been getting these wrong: ${i.weakConcepts.join(', ')}.` : '',
    i.simplify ? 'The learner is struggling. Return the simplest visual that teaches the core idea: difficulty "beginner", 3 to 5 elements, short descriptions.' : '',
    `Lesson explanation:\n"""\n${i.content.slice(0, 7000)}\n"""`,
  ].filter(Boolean);

  return `${lines.join('\n\n')}

Return JSON in this shape. If no visual is needed, return only {"needs_visual": false, "visual_reason": string}.
{
 "needs_visual": true,
 "visual_reason": string,
 "visual_type": one of ${VISUAL_TYPES.join(' | ')},
 "subject": one of ${SUBJECTS.join(' | ')},
 "topic": string, "title": string, "learning_goal": string,
 "difficulty": "beginner" | "intermediate" | "advanced",
 "view": optional "anterior"|"posterior"|"lateral"|"medial"|"superior"|"inferior"|"sagittal"|"coronal"|"transverse"|"schematic",
 "axes": optional {"top"?: term, "bottom"?: term, "left"?: term, "right"?: term} using anterior|posterior|medial|lateral|superior|inferior|proximal|distal|superficial|deep,
 "elements": [{"id": string, "label": string, "short_label"?: string, "description": string, "role"?: string,
   "pos"?: {"x": 0-8, "y": 0-10}, "symbol"?: "C", "charge"?: number, "when"?: string,
   "attributes"?: [{"name": string, "value": string}], "section"?: {"ring": id, "angle": 0-359, "span": 10-180}}],
 "relationships": [{"from": id, "to": id, "relation": one of ${RELATION_KEYS.join(' | ')}, "label"?: string, "bond_order"?: 1-3, "role"?: "origin"|"insertion"}],
 "sequence": [ids in display order],
 "steps": [{"title": string, "text": string, "elements": [ids]}],
 "interactions": ["select", "toggle_labels"?, "reveal_layers"?, "step_through"?],
 "view_variants": optional [{"view": "anterior"|"posterior"|"lateral"|"medial"|"superior"|"inferior"|"sagittal"|"coronal"|"transverse"|"schematic", "axes"?: object, "positions": [{"id": string, "pos": {"x": 0-8, "y": 0-10}}]}],
 "graph": optional {"kind": "line"|"bar", "x_label": string, "y_label": string, "points": [{"label": string, "y": number}]}
}`;
}

// ── Client call ─────────────────────────────────────────────────────────────

export interface RequestVisualArgs extends PlannerInput {
  region: string;
  projectId: string;
  userGroqKey?: string;
}

/**
 * Asks the server for a VisualSpec. The server validates once (and retries
 * invalid output through runAIJSON); we validate again here because this value
 * is about to be stored and rendered. Throws on provider or validation failure.
 */
export async function requestLessonVisual(a: RequestVisualArgs): Promise<VisualDecision> {
  const raw = await callAIJSON<unknown>({
    task: 'visual_planner',
    prompt: buildPlannerPrompt(a),
    systemInstruction: PLANNER_SYSTEM,
    persona: PLANNER_PERSONA,
    region: a.region,
    projectId: a.projectId,
    userGroqKey: a.userGroqKey,
    validationType: 'visual_spec',
  });
  const checked = validateVisualDecision(raw);
  if (!checked.ok) throw new Error(`Visual rejected: ${checked.error}`);
  return checked.data;
}
