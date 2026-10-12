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

// ── Phase 3: skeletal molecules. Coordinates are normalised to 0-100; formulas are verified by lib/visual/chem.ts ──
export const betaGlucose: Raw = {"needs_visual": true, "visual_type": "molecular_structure", "display": "skeletal", "elements": [{"id": "c1", "label": "C1 (anomeric carbon)", "symbol": "C", "at": {"x": 82.2, "y": 50.0}, "short_label": "1", "description": "The anomeric carbon. In β-D-glucopyranose its OH points up, on the same side as the CH₂OH group."}, {"id": "c2", "label": "C2", "symbol": "C", "at": {"x": 68.6, "y": 71.5}, "short_label": "2", "description": "Ring carbon next to the anomeric carbon; its OH points down."}, {"id": "c3", "label": "C3", "symbol": "C", "at": {"x": 31.4, "y": 71.5}, "short_label": "3", "description": "Ring carbon between C2 and C4; its OH points up."}, {"id": "c4", "label": "C4", "symbol": "C", "at": {"x": 17.8, "y": 50.0}, "short_label": "4", "description": "Ring carbon next to C5; its OH points down."}, {"id": "c5", "label": "C5", "symbol": "C", "at": {"x": 35.3, "y": 34.4}, "short_label": "5", "description": "Ring carbon that carries the CH₂OH group (C6)."}, {"id": "o5", "label": "Ring oxygen (O5)", "symbol": "O", "at": {"x": 64.7, "y": 34.4}, "description": "The oxygen that closes the six-membered pyranose ring."}, {"id": "o1", "label": "OH on C1", "symbol": "O", "at": {"x": 84.2, "y": 26.5}}, {"id": "o2", "label": "OH on C2", "symbol": "O", "at": {"x": 68.6, "y": 93.0}}, {"id": "o3", "label": "OH on C3", "symbol": "O", "at": {"x": 31.4, "y": 53.9}}, {"id": "o4", "label": "OH on C4", "symbol": "O", "at": {"x": 15.8, "y": 71.5}}, {"id": "c6", "label": "C6", "symbol": "C", "at": {"x": 35.3, "y": 14.8}, "short_label": "6", "description": "The CH₂OH group, which points up in D-glucose."}, {"id": "o6", "label": "OH on C6", "symbol": "O", "at": {"x": 52.9, "y": 7.0}}], "relationships": [{"from": "c1", "relation": "bonded_to", "to": "o5"}, {"from": "o5", "relation": "bonded_to", "to": "c5"}, {"from": "c5", "relation": "bonded_to", "to": "c4"}, {"from": "c4", "relation": "bonded_to", "to": "c3"}, {"from": "c3", "relation": "bonded_to", "to": "c2", "bond_style": "bold"}, {"from": "c2", "relation": "bonded_to", "to": "c1"}, {"from": "c1", "relation": "bonded_to", "to": "o1"}, {"from": "c2", "relation": "bonded_to", "to": "o2"}, {"from": "c3", "relation": "bonded_to", "to": "o3"}, {"from": "c4", "relation": "bonded_to", "to": "o4"}, {"from": "c5", "relation": "bonded_to", "to": "c6"}, {"from": "c6", "relation": "bonded_to", "to": "o6"}], "subject": "biochemistry", "topic": "glucose structure", "title": "β-D-Glucose (Haworth Projection)", "learning_goal": "Identify the ring atoms of glucose and which substituents point up or down", "difficulty": "intermediate", "formula": "C6H12O6", "caveat": "Flat Haworth drawing. The heavy line is the edge nearest the viewer. Substituents point up or down from the ring."};

export const lAlanine: Raw = {"needs_visual": true, "visual_type": "molecular_structure", "display": "skeletal", "elements": [{"id": "n", "label": "Amino group (N)", "symbol": "N", "at": {"x": 7.0, "y": 57.8}, "description": "The nitrogen of the amino group, –NH₂."}, {"id": "ca", "label": "Alpha carbon", "symbol": "C", "at": {"x": 35.7, "y": 42.2}, "description": "The central carbon that holds the amino group, the carboxyl group and the side chain."}, {"id": "cc", "label": "Carboxyl carbon", "symbol": "C", "at": {"x": 64.3, "y": 57.8}, "description": "The carbon of the carboxyl group, –COOH."}, {"id": "od", "label": "Carbonyl oxygen (=O)", "symbol": "O", "at": {"x": 64.3, "y": 89.1}, "description": "The oxygen double-bonded to the carboxyl carbon."}, {"id": "oh", "label": "Hydroxyl oxygen (–OH)", "symbol": "O", "at": {"x": 93.0, "y": 42.2}, "description": "The hydroxyl oxygen of the carboxyl group."}, {"id": "cb", "label": "Side chain (CH₃)", "symbol": "C", "at": {"x": 35.7, "y": 10.9}, "description": "The side chain of alanine is a single methyl group."}], "relationships": [{"from": "n", "relation": "bonded_to", "to": "ca"}, {"from": "ca", "relation": "bonded_to", "to": "cc"}, {"from": "cc", "relation": "bonded_to", "to": "od", "bond_order": 2}, {"from": "cc", "relation": "bonded_to", "to": "oh"}, {"from": "ca", "relation": "bonded_to", "to": "cb", "bond_style": "wedge"}], "subject": "biochemistry", "topic": "amino acid structure", "title": "An Amino Acid: L-Alanine", "learning_goal": "Find the amino group, carboxyl group, alpha carbon and side chain", "difficulty": "beginner", "formula": "C3H7NO2", "caveat": "Neutral form shown. At body pH amino acids exist mostly as zwitterions (NH₃⁺ and COO⁻). The wedge shows the side chain toward the viewer (L form)."};

export const palmiticAcid: Raw = {"needs_visual": true, "visual_type": "molecular_structure", "display": "skeletal", "elements": [{"id": "o_d", "label": "Carbonyl oxygen (=O)", "symbol": "O", "at": {"x": 12.4, "y": 54.7}, "description": "Oxygen double-bonded to C1."}, {"id": "o_h", "label": "Hydroxyl oxygen (–OH)", "symbol": "O", "at": {"x": 7.0, "y": 45.3}, "description": "Together with the carbonyl group this makes the carboxylic acid end."}, {"id": "c1", "label": "C1 (carboxyl carbon)", "symbol": "C", "at": {"x": 12.4, "y": 48.4}, "short_label": "1", "description": "The carbon of the carboxylic acid group."}, {"id": "c2", "label": "C2", "symbol": "C", "at": {"x": 17.7, "y": 45.3}, "short_label": "2"}, {"id": "c3", "label": "C3", "symbol": "C", "at": {"x": 23.1, "y": 48.4}, "short_label": "3"}, {"id": "c4", "label": "C4", "symbol": "C", "at": {"x": 28.5, "y": 45.3}, "short_label": "4"}, {"id": "c5", "label": "C5", "symbol": "C", "at": {"x": 33.9, "y": 48.4}, "short_label": "5"}, {"id": "c6", "label": "C6", "symbol": "C", "at": {"x": 39.2, "y": 45.3}, "short_label": "6"}, {"id": "c7", "label": "C7", "symbol": "C", "at": {"x": 44.6, "y": 48.4}, "short_label": "7"}, {"id": "c8", "label": "C8", "symbol": "C", "at": {"x": 50.0, "y": 45.3}, "short_label": "8"}, {"id": "c9", "label": "C9", "symbol": "C", "at": {"x": 55.4, "y": 48.4}, "short_label": "9"}, {"id": "c10", "label": "C10", "symbol": "C", "at": {"x": 60.8, "y": 45.3}, "short_label": "10"}, {"id": "c11", "label": "C11", "symbol": "C", "at": {"x": 66.1, "y": 48.4}, "short_label": "11"}, {"id": "c12", "label": "C12", "symbol": "C", "at": {"x": 71.5, "y": 45.3}, "short_label": "12"}, {"id": "c13", "label": "C13", "symbol": "C", "at": {"x": 76.9, "y": 48.4}, "short_label": "13"}, {"id": "c14", "label": "C14", "symbol": "C", "at": {"x": 82.2, "y": 45.3}, "short_label": "14"}, {"id": "c15", "label": "C15", "symbol": "C", "at": {"x": 87.6, "y": 48.4}, "short_label": "15"}, {"id": "c16", "label": "C16 (methyl end)", "symbol": "C", "at": {"x": 93.0, "y": 45.3}, "short_label": "16", "description": "The terminal methyl carbon at the far end of the chain."}], "relationships": [{"from": "c1", "relation": "bonded_to", "to": "c2"}, {"from": "c2", "relation": "bonded_to", "to": "c3"}, {"from": "c3", "relation": "bonded_to", "to": "c4"}, {"from": "c4", "relation": "bonded_to", "to": "c5"}, {"from": "c5", "relation": "bonded_to", "to": "c6"}, {"from": "c6", "relation": "bonded_to", "to": "c7"}, {"from": "c7", "relation": "bonded_to", "to": "c8"}, {"from": "c8", "relation": "bonded_to", "to": "c9"}, {"from": "c9", "relation": "bonded_to", "to": "c10"}, {"from": "c10", "relation": "bonded_to", "to": "c11"}, {"from": "c11", "relation": "bonded_to", "to": "c12"}, {"from": "c12", "relation": "bonded_to", "to": "c13"}, {"from": "c13", "relation": "bonded_to", "to": "c14"}, {"from": "c14", "relation": "bonded_to", "to": "c15"}, {"from": "c15", "relation": "bonded_to", "to": "c16"}, {"from": "c1", "relation": "bonded_to", "to": "o_d", "bond_order": 2}, {"from": "c1", "relation": "bonded_to", "to": "o_h"}], "subject": "biochemistry", "topic": "saturated fatty acid structure", "title": "A Saturated Fatty Acid: Palmitic Acid", "learning_goal": "Recognise a carboxylic acid head and a long, fully saturated hydrocarbon chain", "difficulty": "beginner", "formula": "C16H32O2", "caveat": "Zigzag skeletal drawing: every corner is a carbon with enough hydrogens to make four bonds. Zoom in to tap individual carbons."};

export const adenosineMonophosphate: Raw = {"needs_visual": true, "visual_type": "molecular_structure", "display": "skeletal", "elements": [{"id": "c5", "label": "C5", "symbol": "C", "at": {"x": 32.0, "y": 25.3}}, {"id": "c6", "label": "C6", "symbol": "C", "at": {"x": 21.4, "y": 19.2}}, {"id": "n1", "label": "N1", "symbol": "N", "at": {"x": 10.8, "y": 25.3}}, {"id": "c2", "label": "C2", "symbol": "C", "at": {"x": 10.8, "y": 37.6}}, {"id": "n3", "label": "N3", "symbol": "N", "at": {"x": 21.4, "y": 43.7}}, {"id": "c4", "label": "C4", "symbol": "C", "at": {"x": 32.0, "y": 37.6}}, {"id": "n6", "label": "Amino group on C6", "symbol": "N", "at": {"x": 21.4, "y": 7.0}, "description": "The –NH₂ group that makes this base adenine."}, {"id": "n7", "label": "N7", "symbol": "N", "at": {"x": 43.6, "y": 21.6}}, {"id": "c8", "label": "C8", "symbol": "C", "at": {"x": 50.8, "y": 31.4}}, {"id": "n9", "label": "N9", "symbol": "N", "at": {"x": 43.6, "y": 41.3}, "description": "The ring nitrogen that joins the base to the sugar."}, {"id": "c1p", "label": "C1′ (sugar)", "symbol": "C", "at": {"x": 43.6, "y": 53.6}, "short_label": "1′", "description": "The sugar carbon bonded to the base."}, {"id": "o4p", "label": "Ring oxygen (O4′)", "symbol": "O", "at": {"x": 53.5, "y": 60.7}}, {"id": "c4p", "label": "C4′", "symbol": "C", "at": {"x": 49.7, "y": 72.4}, "short_label": "4′"}, {"id": "c3p", "label": "C3′", "symbol": "C", "at": {"x": 37.5, "y": 72.4}, "short_label": "3′"}, {"id": "c2p", "label": "C2′", "symbol": "C", "at": {"x": 33.7, "y": 60.7}, "short_label": "2′"}, {"id": "o2p", "label": "OH on C2′", "symbol": "O", "at": {"x": 23.8, "y": 57.5}, "description": "Ribose has an OH on C2′. Deoxyribose does not."}, {"id": "o3p", "label": "OH on C3′", "symbol": "O", "at": {"x": 31.4, "y": 80.8}}, {"id": "c5p", "label": "C5′ (CH₂)", "symbol": "C", "at": {"x": 55.8, "y": 80.8}, "short_label": "5′", "description": "The carbon that carries the phosphate group."}, {"id": "o5p", "label": "O5′ (ester oxygen)", "symbol": "O", "at": {"x": 66.4, "y": 86.9}, "description": "Links C5′ of the sugar to the phosphate."}, {"id": "p", "label": "Phosphorus", "symbol": "P", "at": {"x": 77.0, "y": 80.8}, "description": "The central atom of the phosphate group."}, {"id": "o_p1", "label": "Phosphoryl oxygen (=O)", "symbol": "O", "at": {"x": 77.0, "y": 68.6}}, {"id": "o_p2", "label": "Hydroxyl oxygen (–OH)", "symbol": "O", "at": {"x": 89.2, "y": 80.8}}, {"id": "o_p3", "label": "Hydroxyl oxygen (–OH)", "symbol": "O", "at": {"x": 77.0, "y": 93.0}}], "relationships": [{"from": "c5", "relation": "bonded_to", "to": "c6"}, {"from": "c6", "relation": "bonded_to", "to": "n1", "bond_order": 2}, {"from": "n1", "relation": "bonded_to", "to": "c2"}, {"from": "c2", "relation": "bonded_to", "to": "n3", "bond_order": 2}, {"from": "n3", "relation": "bonded_to", "to": "c4"}, {"from": "c4", "relation": "bonded_to", "to": "c5", "bond_order": 2}, {"from": "c6", "relation": "bonded_to", "to": "n6"}, {"from": "c5", "relation": "bonded_to", "to": "n7"}, {"from": "n7", "relation": "bonded_to", "to": "c8", "bond_order": 2}, {"from": "c8", "relation": "bonded_to", "to": "n9"}, {"from": "n9", "relation": "bonded_to", "to": "c4"}, {"from": "n9", "relation": "bonded_to", "to": "c1p"}, {"from": "c1p", "relation": "bonded_to", "to": "o4p"}, {"from": "o4p", "relation": "bonded_to", "to": "c4p"}, {"from": "c4p", "relation": "bonded_to", "to": "c3p"}, {"from": "c3p", "relation": "bonded_to", "to": "c2p"}, {"from": "c2p", "relation": "bonded_to", "to": "c1p"}, {"from": "c2p", "relation": "bonded_to", "to": "o2p"}, {"from": "c3p", "relation": "bonded_to", "to": "o3p"}, {"from": "c4p", "relation": "bonded_to", "to": "c5p"}, {"from": "c5p", "relation": "bonded_to", "to": "o5p"}, {"from": "o5p", "relation": "bonded_to", "to": "p"}, {"from": "p", "relation": "bonded_to", "to": "o_p1", "bond_order": 2}, {"from": "p", "relation": "bonded_to", "to": "o_p2"}, {"from": "p", "relation": "bonded_to", "to": "o_p3"}], "subject": "biochemistry", "topic": "nucleotide structure", "title": "A Nucleotide: Adenosine Monophosphate (AMP)", "learning_goal": "Identify the base, the sugar and the phosphate group of a nucleotide", "difficulty": "intermediate", "formula": "C10H14N5O7P", "caveat": "Flat schematic of the connectivity. The three-dimensional arrangement of the sugar OH groups is not shown. Adenine is drawn with one common alternating double-bond pattern."};


// ── Gait cycle (terminology and percentages follow the Perry model of normal walking) ──
const phase = (id: string, label: string, when: string, description: string) => ({ id, label, when, description });
export const gaitCycle: Raw = {
  needs_visual: true, visual_type: 'timeline', subject: 'prosthetics_orthotics', topic: 'gait cycle', title: 'Phases of the Gait Cycle',
  learning_goal: 'Put the eight phases of walking in order and say which belong to stance and which to swing', difficulty: 'intermediate',
  caveat: 'Percentages are typical for normal walking and shift with speed. Stance is about 60% of the cycle and swing about 40%.',
  elements: [
    phase('ic', 'Initial contact', '0%', 'The foot first touches the ground and the cycle begins.'),
    phase('lr', 'Loading response', '0-10%', 'Body weight is accepted onto the limb as the foot lowers to the floor.'),
    phase('ms', 'Mid-stance', '10-30%', 'The body moves forward over the supporting foot while the other limb swings through.'),
    phase('ts', 'Terminal stance', '30-50%', 'The heel rises and the body moves ahead of the supporting foot.'),
    phase('ps', 'Pre-swing', '50-60%', 'Weight transfers to the other limb and this one prepares to leave the ground.'),
    phase('is', 'Initial swing', '60-73%', 'The foot lifts off the ground and the thigh starts moving forward.'),
    phase('mw', 'Mid-swing', '73-87%', 'The limb keeps advancing and the foot clears the floor.'),
    phase('tw', 'Terminal swing', '87-100%', 'The knee extends and the limb prepares for the next initial contact.'),
  ],
  sequence: ['ic', 'lr', 'ms', 'ts', 'ps', 'is', 'mw', 'tw'],
  relationships: [
    { from: 'ic', relation: 'leads_to', to: 'lr' }, { from: 'lr', relation: 'leads_to', to: 'ms' }, { from: 'ms', relation: 'leads_to', to: 'ts' }, { from: 'ts', relation: 'leads_to', to: 'ps' },
    { from: 'ps', relation: 'leads_to', to: 'is' }, { from: 'is', relation: 'leads_to', to: 'mw' }, { from: 'mw', relation: 'leads_to', to: 'tw' },
  ],
};

// ── Action potential: schematic values that show the SHAPE, not measurements ──
export const actionPotential: Raw = {
  needs_visual: true, visual_type: 'graph', subject: 'physiology', topic: 'action potential', title: 'The Action Potential (Schematic)',
  learning_goal: 'Follow the membrane potential of a neuron through one action potential', difficulty: 'intermediate',
  caveat: 'Schematic values for a typical neuron to show the shape. Real values and timing vary between cells.',
  graph: { kind: 'line', x_label: 'Stage', y_label: 'Membrane potential (mV)', points: [{ label: 'Rest', y: -70 }, { label: 'Threshold', y: -55 }, { label: 'Peak', y: 35 }, { label: 'Undershoot', y: -80 }, { label: 'Rest', y: -70 }] },
  elements: [
    { id: 'rest', label: 'Resting potential', description: 'The membrane sits near -70 mV, with the inside of the cell more negative than the outside.' },
    { id: 'threshold', label: 'Threshold', description: 'If the membrane depolarises to about -55 mV, voltage-gated sodium channels open.' },
    { id: 'peak', label: 'Peak', description: 'Sodium entry makes the inside of the cell positive, to roughly +30 to +40 mV.' },
    { id: 'undershoot', label: 'Undershoot', description: 'Potassium channels stay open a little too long, so the membrane dips below its resting level.' },
  ],
  sequence: ['rest', 'threshold', 'peak', 'undershoot'],
};
