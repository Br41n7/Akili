-- Allow one-page infographics in study_artifacts.
ALTER TABLE study_artifacts DROP CONSTRAINT IF EXISTS study_artifacts_kind_check;
ALTER TABLE study_artifacts ADD CONSTRAINT study_artifacts_kind_check
  CHECK (kind IN ('study_guide', 'slide_deck', 'mind_map', 'knowledge_graph', 'concept_battle', 'infographic'));
