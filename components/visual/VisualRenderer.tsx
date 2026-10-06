'use client';
import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Lightbulb, Sparkles, X } from 'lucide-react';
import { Button, Chip, Surface } from '@/components/ui';
import { buildExplanation, requestAIExplanation, partsForElement, type Explanation } from '@/lib/visual/explain';
import { elementMap, safeVisualSpec, type VisualSpec, type VisualType } from '@/lib/visual/schema';
import { RELATIONS } from '@/lib/visual/vocab';
import type { VisualQuestion } from '@/lib/visual/quiz';
import AnatomyDiagram from './AnatomyDiagram';
import AnatomyLayersDiagram from './AnatomyLayersDiagram';
import ComparisonDiagram from './ComparisonDiagram';
import CycleDiagram from './CycleDiagram';
import FlowchartDiagram from './FlowchartDiagram';
import GraphDiagram from './GraphDiagram';
import HierarchyDiagram from './HierarchyDiagram';
import MechanismDiagram from './MechanismDiagram';
import MolecularStructureDiagram from './MolecularStructureDiagram';
import ProcessDiagram from './ProcessDiagram';
import VisualQuiz from './VisualQuiz';
import type { DiagramProps } from './shared';

/**
 * The only place that maps a visual_type to a component. To add a type: extend VISUAL_TYPES in
 * lib/visual/schema.ts, then add one entry here. A type without an entry shows no diagram at all.
 */
const REGISTRY: Record<VisualType, (p: DiagramProps) => React.ReactElement | null> = {
  process: p => <ProcessDiagram {...p} />,
  timeline: p => <ProcessDiagram {...p} variant="timeline" />,
  flowchart: p => <FlowchartDiagram {...p} />,
  cycle: p => <CycleDiagram {...p} />,
  hierarchy: p => <HierarchyDiagram {...p} />,
  anatomy: p => <AnatomyDiagram {...p} />,
  anatomy_layers: p => <AnatomyLayersDiagram {...p} />,
  cross_section: p => <AnatomyLayersDiagram {...p} variant="rings" />,
  molecular_structure: p => <MolecularStructureDiagram {...p} />,
  comparison: p => <ComparisonDiagram {...p} />,
  mechanism: p => <MechanismDiagram {...p} />,
  graph: p => <GraphDiagram {...p} />,
};

export const SUPPORTED_VISUAL_TYPES = Object.keys(REGISTRY) as VisualType[];
const LABEL_TOGGLE_TYPES: VisualType[] = ['anatomy', 'anatomy_layers', 'cross_section', 'molecular_structure', 'hierarchy', 'process'];

export interface VisualAIContext { projectId: string; region: string; persona?: string; userGroqKey?: string }
export interface VisualRendererProps {
  visualSpec: unknown;
  ai?: VisualAIContext;
  onAnswer?: (q: VisualQuestion, chosen: string, correct: boolean) => void;
  /** Offered after repeated misses; should request a simpler diagram. */
  onSimplify?: () => void;
  simplifying?: boolean;
}

export default function VisualRenderer({ visualSpec, ai, onAnswer, onSimplify, simplifying }: VisualRendererProps) {
  // Every spec is re-validated here. An invalid spec renders nothing, so a lesson never breaks.
  const spec = useMemo(() => safeVisualSpec(visualSpec), [visualSpec]);
  if (!spec || !REGISTRY[spec.visual_type]) return null;
  return <Shell key={spec.title + spec.elements.length} spec={spec} ai={ai} onAnswer={onAnswer} onSimplify={onSimplify} simplifying={simplifying} />;
}

function Shell({ spec, ai, onAnswer, onSimplify, simplifying }: { spec: VisualSpec } & Omit<VisualRendererProps, 'visualSpec'>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [showLabels, setShowLabels] = useState(true);
  const [panel, setPanel] = useState<'none' | 'explain' | 'quiz'>('none');
  const [explanation, setExplanation] = useState<Explanation>(() => buildExplanation(spec));
  const [rewording, setRewording] = useState(false);
  const [struggling, setStruggling] = useState(false);

  useEffect(() => { setExplanation(buildExplanation(spec)); }, [spec]);

  const map = elementMap(spec);
  const selected = selectedId ? map.get(selectedId) : null;
  const canHideLabels = LABEL_TOGGLE_TYPES.includes(spec.visual_type);
  const render = REGISTRY[spec.visual_type];

  const reword = async () => {
    if (!ai) return;
    setRewording(true);
    setExplanation(await requestAIExplanation(spec, ai));
    setRewording(false);
  };

  return (
    <Surface className="space-y-3 p-3.5" role="region" aria-label={`Diagram: ${spec.title}`}>
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="biro">Diagram</Chip>
          {spec.provenance === 'ai_generated' && <Chip tone="marker">AI-made schematic · simplified</Chip>}
        </div>
        <h3 className="mt-1.5 text-lg font-extrabold leading-snug">{spec.title}</h3>
        <p className="text-sm text-muted">{spec.learning_goal}</p>
      </div>

      {canHideLabels && (
        <button type="button" onClick={() => setShowLabels(v => !v)} aria-pressed={!showLabels} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule bg-paper px-3 text-sm font-semibold">
          {showLabels ? <EyeOff size={16} /> : <Eye size={16} />} {showLabels ? 'Hide labels to test yourself' : 'Show labels'}
        </button>
      )}

      {render({ spec, selectedId, onSelect: setSelectedId, highlightIds, showLabels })}

      {selected ? (
        <DetailPanel spec={spec} id={selected.id} onSelect={setSelectedId} onClose={() => setSelectedId(null)} />
      ) : (
        spec.visual_type !== 'graph' && <p className="text-center text-xs font-semibold text-muted">Tap any part for details</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant={panel === 'explain' ? 'dark' : 'quiet'} onClick={() => setPanel(panel === 'explain' ? 'none' : 'explain')}><Lightbulb size={16} /> Explain diagram</Button>
        <Button variant={panel === 'quiz' ? 'dark' : 'quiet'} onClick={() => { setPanel(panel === 'quiz' ? 'none' : 'quiz'); setHighlightIds([]); }}>Test me</Button>
      </div>

      {panel === 'explain' && (
        <div className="space-y-2.5 rounded-xl bg-chalk p-3.5" aria-live="polite">
          <p className="font-read text-base leading-relaxed">{explanation.summary}</p>
          <ol className="space-y-2">
            {explanation.parts.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => setSelectedId(p.id)} className="w-full rounded-lg bg-paper px-3 py-2 text-left font-read text-[15px] leading-relaxed active:bg-biro-wash">{p.text}</button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">{explanation.source === 'spec' ? 'Built only from the labels and relationships in this diagram.' : 'Reworded by AI using only the parts of this diagram.'}</p>
          {ai && explanation.source === 'spec' && (
            <Button variant="quiet" block loading={rewording} onClick={reword}>{!rewording && <Sparkles size={15} />} Explain in simpler words</Button>
          )}
        </div>
      )}

      {panel === 'quiz' && (
        <VisualQuiz spec={spec} onHighlight={setHighlightIds} onAnswer={onAnswer} onStruggle={() => setStruggling(true)} onClose={() => { setPanel('none'); setHighlightIds([]); }} />
      )}

      {struggling && onSimplify && spec.difficulty !== 'beginner' && (
        <Button variant="ghost" block loading={simplifying} onClick={onSimplify}>Show me a simpler diagram</Button>
      )}
      {spec.caveat && <p className="text-xs text-muted">{spec.caveat}</p>}
    </Surface>
  );
}

function DetailPanel({ spec, id, onSelect, onClose }: { spec: VisualSpec; id: string; onSelect: (id: string | null) => void; onClose: () => void }) {
  const map = elementMap(spec);
  const el = map.get(id)!;
  const lines = partsForElement(spec, id);
  const neighbours = new Set<string>();
  for (const r of spec.relationships) { if (r.from === id) neighbours.add(r.to); if (r.to === id) neighbours.add(r.from); }
  // Layers: neighbours are the adjacent entries in the sequence, which the spec itself defines.
  const si = spec.sequence.indexOf(id);
  const layered = spec.visual_type === 'anatomy_layers' || spec.visual_type === 'cross_section';
  const above = layered && si > 0 ? map.get(spec.sequence[si - 1]) : null;
  const below = layered && si >= 0 && si < spec.sequence.length - 1 ? map.get(spec.sequence[si + 1]) : null;

  return (
    <div className="rounded-xl border-2 border-biro bg-biro-wash p-3.5" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-extrabold leading-snug">{el.label}</p>
        <button type="button" onClick={onClose} aria-label="Close details" className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted"><X size={18} /></button>
      </div>
      {lines.length > 0 && <p className="mt-1 font-read text-[15px] leading-relaxed">{lines.join(' ')}</p>}
      {(above || below) && (
        <p className="mt-2 text-sm text-ink-soft">
          {above && <>Above: <b>{above.label}</b>. </>}{below && <>Below: <b>{below.label}</b>.</>}
        </p>
      )}
      {neighbours.size > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2" aria-label="Related parts">
          {[...neighbours].map(n => {
            const rel = spec.relationships.find(r => (r.from === id && r.to === n) || (r.to === id && r.from === n))!;
            return <button key={n} type="button" onClick={() => onSelect(n)} className="min-h-11 rounded-lg border border-ink/20 bg-paper px-3 text-sm font-semibold">{map.get(n)?.label}<span className="ml-1 text-xs font-normal text-muted">{RELATIONS[rel.relation].phrase.replace(/^is /, '')}</span></button>;
          })}
        </div>
      )}
    </div>
  );
}
