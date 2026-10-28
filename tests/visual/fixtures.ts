export * from '@/lib/visual/curated-data';
import { midArmSection, proteinStructure, peptideBond, proteinSynthesis, glycolysis, brachialPlexus, bicepsBrachii, skinLayers, bodyWallLayers, kneeJoint, cellCycleCompare, enzymeMechanism, cycleExample } from '@/lib/visual/curated-data';

export const VALID_FIXTURES: Record<string, Record<string, any>> = { midArmSection, proteinStructure, peptideBond, proteinSynthesis, glycolysis, brachialPlexus, bicepsBrachii, skinLayers, bodyWallLayers, kneeJoint, cellCycleCompare, enzymeMechanism, cycleExample };

export const NON_VISUAL_LESSON = {
  title: 'The Treaty of Versailles',
  content: 'The Treaty of Versailles was signed in 1919 and formally ended the war between Germany and the Allied Powers. It was negotiated in Paris and remains widely debated by historians today.',
  key_concepts: ['treaty', 'reparations'],
};
