export function summarizeAssessment(questions: any[], answers: Record<string, string>) {
  const byConcept: Record<string, { total: number; correct: number }> = {};
  for (const q of questions) {
    const concept = q.concept || 'General';
    const correct = q.type === 'fill_gap'
      ? answers[q.id]?.trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase()
      : answers[q.id] === q.correct_answer;
    byConcept[concept] ||= { total: 0, correct: 0 };
    byConcept[concept].total++;
    if (correct) byConcept[concept].correct++;
  }
  const entries = Object.entries(byConcept).map(([concept, x]) => ({ concept, ratio: x.correct / x.total, ...x }));
  const weak = entries.filter(x => x.ratio < 0.7).sort((a,b) => a.ratio-b.ratio).map(x => x.concept);
  const strong = entries.filter(x => x.ratio >= 0.8).sort((a,b) => b.ratio-a.ratio).map(x => x.concept);
  return { weak_concepts: weak, strong_concepts: strong, next_focus: weak.slice(0, 3), byConcept: entries, needsAI: entries.some(x => x.ratio < 0.5 && x.total >= 2) };
}
