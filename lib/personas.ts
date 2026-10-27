/** Tutor styles a learner can choose. The ids must match PERSONA_IDS in lib/ai-tasks.ts (a test checks this). */
export const PERSONA_CHOICES = [
  { id: 'friendly', label: 'Friendly', blurb: 'Simple words and real examples, like a patient older sibling.', sample: 'Think of osmosis like water walking to the side of the room where the crowd is.' },
  { id: 'strict', label: 'Rigorous', blurb: 'Formal, precise language. Depth and accuracy over simplicity.', sample: 'Osmosis is the net movement of water across a selectively permeable membrane down its water potential gradient.' },
  { id: 'socratic', label: 'Socratic', blurb: 'Guides you with questions instead of handing you the answer.', sample: 'If one side has more dissolved solute, which side has less free water? What do you think happens?' },
  { id: 'exam', label: 'Exam coach', blurb: 'Mark-scheme language and technique to win marks.', sample: 'For 3 marks: state water moves, name the direction (high to low water potential), mention the membrane.' },
  { id: 'research', label: 'Critical reviewer', blurb: 'Challenges assumptions, like a peer reviewer.', sample: 'You describe osmosis as passive. Under what conditions is that claim incomplete?' },
] as const;
export type ChoosablePersona = (typeof PERSONA_CHOICES)[number]['id'];
export const CHOOSABLE_IDS: readonly string[] = PERSONA_CHOICES.map(p => p.id);
export const isChoosablePersona = (v: unknown): v is ChoosablePersona => typeof v === 'string' && CHOOSABLE_IDS.includes(v);
