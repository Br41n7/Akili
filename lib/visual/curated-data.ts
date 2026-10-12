/**
 * Built-in specs for core topics, used before the AI planner when a lesson title matches (see curated.ts).
 * Written in the shape a careful model should return, from standard textbook content. They have NOT been
 * reviewed by a subject expert: every entry ships as reviewed: false and shows "awaiting review" in the UI
 * until someone checks it and flips the flag in curated.ts.
 */
type Raw = Record<string, any>;
const el = (id: string, label: string, description: string, extra: Raw = {}) => ({ id, label, description, ...extra });
const rel = (from: string, relation: string, to: string, extra: Raw = {}) => ({ from, relation, to, ...extra });

export const proteinStructure: Raw = {
  needs_visual: true, visual_reason: 'Four levels of protein organisation are a hierarchy.',
  visual_type: 'hierarchy', subject: 'biochemistry', topic: 'protein structure', title: 'Levels of Protein Structure',
  learning_goal: 'Distinguish primary, secondary, tertiary and quaternary structure', difficulty: 'beginner',
  elements: [
    el('primary', 'Primary structure', 'The linear sequence of amino acids in a polypeptide chain.'),
    el('secondary', 'Secondary structure', 'Local folding of the chain into alpha-helices and beta-sheets, held by hydrogen bonds.'),
    el('tertiary', 'Tertiary structure', 'The overall three-dimensional shape of one polypeptide chain.'),
    el('quaternary', 'Quaternary structure', 'The arrangement of two or more polypeptide chains into one protein.'),
  ],
  sequence: ['primary', 'secondary', 'tertiary', 'quaternary'],
  relationships: [rel('primary', 'leads_to', 'secondary', { label: 'folds locally' }), rel('secondary', 'leads_to', 'tertiary', { label: 'folds overall' }), rel('tertiary', 'leads_to', 'quaternary', { label: 'chains assemble' })],
  interactions: ['select'],
};

export const peptideBond: Raw = {
  needs_visual: true, visual_type: 'molecular_structure', subject: 'biochemistry', topic: 'peptide bond', title: 'A Peptide Bond',
  learning_goal: 'Identify the peptide bond between two amino acids', difficulty: 'intermediate',
  elements: [
    el('r1', 'Side chain R1', 'The variable group of the first amino acid.', { kind: 'group', short_label: 'R1', pos: { x: 0, y: 3 } }),
    el('ca1', 'Alpha carbon 1', 'Central carbon of the first amino acid.', { symbol: 'C', pos: { x: 1, y: 5 } }),
    el('c', 'Carbonyl carbon', 'Carbon of the first amino acid that joins to nitrogen.', { symbol: 'C', pos: { x: 3, y: 4 } }),
    el('o', 'Carbonyl oxygen', 'Oxygen double-bonded to the carbonyl carbon.', { symbol: 'O', pos: { x: 3, y: 2 } }),
    el('n', 'Amide nitrogen', 'Nitrogen of the second amino acid.', { symbol: 'N', pos: { x: 5, y: 5 } }),
    el('h', 'Amide hydrogen', 'Hydrogen attached to the amide nitrogen.', { symbol: 'H', pos: { x: 5, y: 7 } }),
    el('ca2', 'Alpha carbon 2', 'Central carbon of the second amino acid.', { symbol: 'C', pos: { x: 7, y: 4 } }),
    el('r2', 'Side chain R2', 'The variable group of the second amino acid.', { kind: 'group', short_label: 'R2', pos: { x: 8, y: 2 } }),
  ],
  relationships: [
    rel('r1', 'bonded_to', 'ca1'), rel('ca1', 'bonded_to', 'c'), rel('c', 'bonded_to', 'o', { bond_order: 2 }),
    rel('c', 'bonded_to', 'n', { bond_kind: 'peptide', label: 'peptide bond' }), rel('n', 'bonded_to', 'h'),
    rel('n', 'bonded_to', 'ca2'), rel('ca2', 'bonded_to', 'r2'),
  ],
};

export const proteinSynthesis: Raw = {
  needs_visual: true, visual_type: 'process', subject: 'biochemistry', topic: 'protein synthesis', title: 'From Gene to Protein',
  learning_goal: 'Follow information from DNA to a polypeptide', difficulty: 'beginner',
  elements: [
    el('dna', 'DNA (gene)', 'The stored instructions for one protein.'),
    el('transcription', 'Transcription', 'RNA polymerase copies the gene into messenger RNA.'),
    el('mrna', 'mRNA', 'A copy of the gene that carries the instructions to the ribosome.'),
    el('translation', 'Translation', 'The ribosome reads mRNA codons while tRNA delivers the matching amino acids.'),
    el('polypeptide', 'Polypeptide', 'The chain of amino acids that folds into a protein.'),
  ],
  sequence: ['dna', 'transcription', 'mrna', 'translation', 'polypeptide'],
  relationships: [rel('dna', 'leads_to', 'transcription'), rel('transcription', 'produces', 'mrna'), rel('mrna', 'leads_to', 'translation'), rel('translation', 'produces', 'polypeptide')],
};

export const glycolysis: Raw = {
  needs_visual: true, visual_type: 'process', subject: 'biochemistry', topic: 'glycolysis', title: 'Glycolysis: Glucose to Pyruvate',
  learning_goal: 'Follow the main stages of glycolysis and where ATP is used and made', difficulty: 'intermediate',
  elements: [
    el('glucose', 'Glucose', 'Six-carbon sugar that enters glycolysis.'),
    el('g6p', 'Glucose-6-phosphate', 'Formed when hexokinase transfers a phosphate from ATP to glucose.'),
    el('f16bp', 'Fructose-1,6-bisphosphate', 'Formed by phosphofructokinase-1 using a second ATP; a key regulated step.'),
    el('g3p', 'Glyceraldehyde-3-phosphate', 'Two three-carbon molecules are produced when the six-carbon sugar is split.'),
    el('bpg', '1,3-Bisphosphoglycerate', 'Formed as NAD+ is reduced to NADH.'),
    el('pep', 'Phosphoenolpyruvate', 'High-energy intermediate that can pass its phosphate to ADP.'),
    el('pyruvate', 'Pyruvate', 'End product of glycolysis; ATP is made in the step that forms it.'),
  ],
  sequence: ['glucose', 'g6p', 'f16bp', 'g3p', 'bpg', 'pep', 'pyruvate'],
  relationships: [rel('glucose', 'converts_to', 'g6p'), rel('g6p', 'converts_to', 'f16bp', { label: 'via fructose-6-phosphate' }), rel('f16bp', 'converts_to', 'g3p'), rel('g3p', 'converts_to', 'bpg'), rel('bpg', 'converts_to', 'pep', { label: 'via 3-PG and 2-PG' }), rel('pep', 'converts_to', 'pyruvate')],
};

export const brachialPlexus: Raw = {
  needs_visual: true, visual_type: 'anatomy', subject: 'anatomy', topic: 'brachial plexus', title: 'Brachial Plexus: Roots to Branches',
  learning_goal: 'Order the five parts of the brachial plexus from the neck to the arm', difficulty: 'beginner', view: 'anterior',
  axes: { top: 'proximal', bottom: 'distal' },
  elements: [
    el('roots', 'Roots', 'Ventral rami of spinal nerves C5 to T1.', { pos: { x: 4, y: 0 } }),
    el('trunks', 'Trunks', 'Upper (C5-C6), middle (C7) and lower (C8-T1) trunks.', { pos: { x: 4, y: 2 } }),
    el('divisions', 'Divisions', 'Each trunk splits into an anterior and a posterior division.', { pos: { x: 4, y: 4 } }),
    el('cords', 'Cords', 'Lateral, posterior and medial cords, named for their position relative to the axillary artery.', { pos: { x: 4, y: 6 } }),
    el('branches', 'Terminal branches', 'Musculocutaneous, axillary, radial, median and ulnar nerves.', { pos: { x: 4, y: 8 } }),
  ],
  relationships: [
    rel('roots', 'gives_rise_to', 'trunks'), rel('trunks', 'gives_rise_to', 'divisions'), rel('divisions', 'gives_rise_to', 'cords'), rel('cords', 'gives_rise_to', 'branches'),
    rel('roots', 'proximal_to', 'trunks'), rel('trunks', 'proximal_to', 'divisions'), rel('divisions', 'proximal_to', 'cords'), rel('cords', 'proximal_to', 'branches'),
  ],
  interactions: ['select'],
};

export const bicepsBrachii: Raw = {
  needs_visual: true, visual_type: 'anatomy', subject: 'anatomy', topic: 'biceps brachii', title: 'Biceps Brachii',
  learning_goal: 'Relate the biceps to the bones it crosses and the nerve that supplies it', difficulty: 'intermediate', view: 'anterior',
  axes: { top: 'proximal', bottom: 'distal' },
  elements: [
    el('scapula', 'Scapula', 'Origin of both heads of the biceps.', { pos: { x: 2, y: 0 } }),
    el('nerve', 'Musculocutaneous nerve', 'Supplies the muscles of the anterior compartment of the arm.', { short_label: 'Musculo-cut. n.', pos: { x: 6, y: 0 } }),
    el('humerus', 'Humerus', 'Bone of the upper arm.', { pos: { x: 2, y: 4 } }),
    el('biceps', 'Biceps brachii', 'Two-headed muscle on the front of the upper arm.', {
      pos: { x: 6, y: 4 },
      attributes: [{ name: 'Origin', value: 'Short head from the coracoid process; long head from the supraglenoid tubercle of the scapula' }, { name: 'Insertion', value: 'Radial tuberosity and bicipital aponeurosis' }, { name: 'Action', value: 'Flexes the elbow and supinates the forearm' }, { name: 'Innervation', value: 'Musculocutaneous nerve (C5-C6)' }, { name: 'Blood supply', value: 'Brachial artery' }],
    }),
    el('radius', 'Radius', 'Lateral bone of the forearm.', { pos: { x: 2, y: 8 } }),
    el('artery', 'Brachial artery', 'Main artery of the arm; it supplies the muscles of the anterior compartment.', { pos: { x: 6, y: 8 } }),
  ],
  relationships: [
    rel('biceps', 'anterior_to', 'humerus'), rel('biceps', 'attaches_to', 'scapula', { role: 'origin' }), rel('biceps', 'attaches_to', 'radius', { role: 'insertion' }),
    rel('biceps', 'innervated_by', 'nerve'), rel('biceps', 'supplied_by', 'artery'), rel('scapula', 'proximal_to', 'radius'), rel('humerus', 'proximal_to', 'radius'),
  ],
};

export const skinLayers: Raw = {
  needs_visual: true, visual_type: 'anatomy_layers', subject: 'anatomy', topic: 'layers of the skin', title: 'Layers of the Skin',
  learning_goal: 'Name the three layers of the skin from the surface inward', difficulty: 'beginner',
  elements: [
    el('epidermis', 'Epidermis', 'Thin outer layer that forms the waterproof barrier.', { role: 'Protects against water loss and entry of microbes.' }),
    el('dermis', 'Dermis', 'Thicker layer containing collagen, blood vessels, nerve endings, hair follicles and glands.', { role: 'Gives strength and supplies the epidermis.' }),
    el('hypodermis', 'Hypodermis', 'Fatty layer beneath the dermis, also called subcutaneous tissue.', { role: 'Insulates and anchors the skin to deeper tissue.' }),
  ],
  sequence: ['epidermis', 'dermis', 'hypodermis'],
  relationships: [rel('epidermis', 'superficial_to', 'dermis'), rel('dermis', 'superficial_to', 'hypodermis')],
  interactions: ['select', 'reveal_layers'],
};

/** Corrects the order given in the task brief: deep fascia lies superficial to (around) muscle. */
export const bodyWallLayers: Raw = {
  needs_visual: true, visual_type: 'anatomy_layers', subject: 'anatomy', topic: 'layers from skin to bone', title: 'Skin to Bone',
  learning_goal: 'Order the tissue layers from the surface to the bone in a limb', difficulty: 'beginner',
  elements: [
    el('skin', 'Skin', 'Epidermis and dermis.'), el('sfascia', 'Superficial fascia', 'Fatty layer just beneath the skin.'),
    el('dfascia', 'Deep fascia', 'Dense connective tissue that wraps the muscles.'), el('muscle', 'Muscle', 'Skeletal muscle beneath the deep fascia.'), el('bone', 'Bone', 'The deepest layer shown.'),
  ],
  sequence: ['skin', 'sfascia', 'dfascia', 'muscle', 'bone'],
  relationships: [rel('skin', 'superficial_to', 'sfascia'), rel('sfascia', 'superficial_to', 'dfascia'), rel('dfascia', 'superficial_to', 'muscle'), rel('muscle', 'superficial_to', 'bone')],
};

export const kneeJoint: Raw = {
  needs_visual: true, visual_type: 'anatomy', subject: 'anatomy', topic: 'knee joint', title: 'Right Knee, Anterior View',
  learning_goal: 'Name the main bones and cartilage of the knee and where they sit', difficulty: 'intermediate', view: 'anterior',
  axes: { top: 'superior', bottom: 'inferior', left: 'lateral', right: 'medial' },
  elements: [
    el('femur', 'Femur', 'Thigh bone; its lower end forms the top of the joint.', { pos: { x: 4, y: 0 } }),
    el('patella', 'Patella', 'Kneecap, embedded in the quadriceps tendon.', { pos: { x: 4, y: 2 } }),
    el('lmen', 'Lateral meniscus', 'C-shaped cartilage pad on the outer side of the joint.', { pos: { x: 2, y: 5 } }),
    el('cruciates', 'Cruciate ligaments (ACL and PCL)', 'Cross in the centre of the joint and limit forward and backward sliding of the tibia.', { short_label: 'ACL / PCL', pos: { x: 4, y: 5 } }),
    el('mmen', 'Medial meniscus', 'C-shaped cartilage pad on the inner side of the joint.', { pos: { x: 6, y: 5 } }),
    el('tibia', 'Tibia', 'Shin bone; its upper surface carries the menisci.', { pos: { x: 4, y: 9 } }),
  ],
  relationships: [
    rel('femur', 'articulates_with', 'tibia'), rel('patella', 'articulates_with', 'femur'),
    rel('femur', 'superior_to', 'tibia'), rel('patella', 'superior_to', 'tibia'),
    rel('lmen', 'lateral_to', 'mmen'), rel('cruciates', 'medial_to', 'lmen'), rel('cruciates', 'lateral_to', 'mmen'),
    rel('lmen', 'attaches_to', 'tibia'), rel('mmen', 'attaches_to', 'tibia'),
  ],
};

export const cellCycleCompare: Raw = {
  needs_visual: true, visual_type: 'comparison', subject: 'biochemistry', topic: 'DNA and RNA', title: 'DNA compared with RNA',
  learning_goal: 'Tell DNA and RNA apart', difficulty: 'beginner',
  elements: [
    el('dna', 'DNA', 'Stores genetic information.', { attributes: [{ name: 'Sugar', value: 'Deoxyribose' }, { name: 'Strands', value: 'Usually double' }, { name: 'Base unique to it', value: 'Thymine' }] }),
    el('rna', 'RNA', 'Carries and uses genetic information.', { attributes: [{ name: 'Sugar', value: 'Ribose' }, { name: 'Strands', value: 'Usually single' }, { name: 'Base unique to it', value: 'Uracil' }] }),
  ],
};

export const enzymeMechanism: Raw = {
  needs_visual: true, visual_type: 'mechanism', subject: 'biochemistry', topic: 'enzyme catalysis', title: 'How an Enzyme Works',
  learning_goal: 'Follow substrate binding and product release', difficulty: 'beginner',
  elements: [el('enzyme', 'Enzyme', 'A protein catalyst.', { kind: 'enzyme' }), el('substrate', 'Substrate', 'The molecule the enzyme acts on.', { kind: 'substance' }), el('es', 'Enzyme-substrate complex', 'Substrate bound in the active site.'), el('product', 'Product', 'What the substrate becomes.', { kind: 'substance' })],
  steps: [
    { title: 'Binding', text: 'The substrate binds to the active site of the enzyme.', elements: ['enzyme', 'substrate'] },
    { title: 'Complex forms', text: 'An enzyme-substrate complex forms and the reaction is catalysed.', elements: ['es'] },
    { title: 'Release', text: 'The product leaves and the enzyme is free to act again.', elements: ['enzyme', 'product'] },
  ],
  sequence: ['enzyme', 'substrate', 'es', 'product'],
  relationships: [rel('enzyme', 'binds', 'substrate'), rel('es', 'produces', 'product')],
};

export const cycleExample: Raw = {
  needs_visual: true, visual_type: 'cycle', subject: 'physiology', topic: 'cross-bridge cycle', title: 'Cross-bridge Cycle',
  learning_goal: 'Follow one cycle of muscle contraction', difficulty: 'intermediate',
  elements: [el('attach', 'Cross-bridge forms', 'Myosin head binds actin.'), el('power', 'Power stroke', 'Myosin pulls actin toward the sarcomere centre.'), el('detach', 'Detachment', 'ATP binds and myosin releases actin.'), el('cock', 'Re-cocking', 'ATP is hydrolysed and the myosin head resets.')],
  sequence: ['attach', 'power', 'detach', 'cock'],
  relationships: [rel('attach', 'leads_to', 'power'), rel('power', 'leads_to', 'detach'), rel('detach', 'leads_to', 'cock'), rel('cock', 'leads_to', 'attach')],
};

export const midArmSection: Raw = {
  needs_visual: true, visual_type: 'cross_section', subject: 'anatomy', topic: 'mid-arm cross-section', title: 'Cross-section of the Mid-arm',
  learning_goal: 'Place the arm layers and the two main muscle compartments', difficulty: 'intermediate', view: 'transverse',
  axes: { top: 'anterior', bottom: 'posterior' },
  elements: [
    el('skin', 'Skin', 'Epidermis and dermis forming the outer covering.'),
    el('subq', 'Subcutaneous tissue', 'Fatty layer beneath the skin.'),
    el('dfascia', 'Deep fascia', 'Dense connective tissue sleeve that wraps the muscles.'),
    el('muscle', 'Muscle layer', 'Skeletal muscle arranged in anterior and posterior compartments.'),
    el('humerus', 'Humerus', 'The bone of the upper arm, at the centre of the section.'),
    el('biceps', 'Biceps brachii', 'Large muscle of the anterior compartment.', { section: { ring: 'muscle', angle: 0, span: 100 } }),
    el('triceps', 'Triceps brachii', 'Muscle of the posterior compartment.', { section: { ring: 'muscle', angle: 180, span: 140 } }),
  ],
  sequence: ['skin', 'subq', 'dfascia', 'muscle', 'humerus'],
  relationships: [rel('biceps', 'anterior_to', 'triceps'), rel('triceps', 'posterior_to', 'biceps')],
};
