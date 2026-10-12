'use client';
import { atomLabel, bondOrderOf, implicitHydrogens, prettyFormula } from '@/lib/visual/chem';
import { dashStrokes, moleculeLayout, shortenSegment, wedgePoints, VIEW_W } from '@/lib/visual/layout';
import { C, SvgText, ZoomFrame, type DiagramProps } from './shared';

const HETERO_FILL: Record<string, string> = { N: C.biro, O: C.red, P: '#B45F06', S: '#8A6D00' };

/**
 * Skeletal structure: carbons are corners (a dot you can tap), heteroatoms are lettered with their hydrogens
 * filled in from standard valence (OH, NH₂, …). Wedge = toward the viewer, hashed = away, heavy line = the edge
 * of a Haworth ring nearest the viewer. The formula shown is the one the validator derived from the bonds.
 */
export default function SkeletalMoleculeDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels }: DiagramProps) {
  const { points, height } = moleculeLayout(spec);
  const pos = new Map(points.map(p => [p.id, p]));
  const el = new Map(spec.elements.map(e => [e.id, e]));
  const hyd = implicitHydrogens(spec);
  const labelled = (id: string) => { const e = el.get(id)!; return e.symbol !== 'C' || !!e.charge; };
  const cx = points.reduce((s, p) => s + p.x, 0) / (points.length || 1), cy = points.reduce((s, p) => s + p.y, 0) / (points.length || 1);
  const H = Math.max(110, height);
  const GAP = 11;
  // Long thin molecules (fatty-acid chains) are unreadable at phone width, so they open zoomed in and scroll sideways inside the frame.
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const aspect = (Math.max(...xs) - Math.min(...xs)) / Math.max(1, Math.max(...ys) - Math.min(...ys));
  const initialZoom = aspect > 3.5 ? 1.8 : 1;

  return (
    <div className="space-y-2">
      {spec.formula && <p className="text-center text-sm font-bold" aria-label={`Molecular formula ${spec.formula}`}>{prettyFormula(spec.formula)}</p>}
      <ZoomFrame label="Molecule diagram" initialZoom={initialZoom}>
        {() => (
          <svg viewBox={`0 0 ${VIEW_W} ${H}`} className="h-auto w-full" role="group" aria-label={`${spec.title}. Skeletal structure.`}>
            {spec.relationships.filter(r => r.relation === 'bonded_to' && pos.has(r.from) && pos.has(r.to)).map((r, i) => {
              const A = pos.get(r.from)!, B = pos.get(r.to)!;
              const seg = shortenSegment(A, B, labelled(r.from) ? GAP : 0, labelled(r.to) ? GAP : 0);
              const order = bondOrderOf(r) || 1;
              const active = selectedId === r.from || selectedId === r.to;
              const stroke = active ? C.biro : C.ink;
              if (r.bond_style === 'wedge') return <polygon key={i} points={wedgePoints(seg.a, seg.b)} fill={stroke} stroke={stroke} strokeLinejoin="round" />;
              if (r.bond_style === 'dash') return <g key={i} stroke={stroke} strokeWidth={1.8} strokeLinecap="round">{dashStrokes(seg.a, seg.b).map((d, k) => <line key={k} {...d} />)}</g>;
              const offs = order === 1 ? [0] : order === 2 ? [-3.2, 3.2] : [-5, 0, 5];
              return (
                <g key={i} stroke={stroke} strokeWidth={r.bond_style === 'bold' ? 5.5 : 2.4} strokeLinecap="round">
                  {offs.map((o, k) => <line key={k} x1={seg.a.x + seg.nx * o} y1={seg.a.y + seg.ny * o} x2={seg.b.x + seg.nx * o} y2={seg.b.y + seg.ny * o} />)}
                </g>
              );
            })}

            {spec.elements.map((e, i) => {
              const p = pos.get(e.id); if (!p) return null;
              const sel = selectedId === e.id, hi = highlightIds.includes(e.id);
              const hetero = labelled(e.id);
              const ring = sel ? C.biro : hi ? C.tick : null;
              const nx = p.x - cx, ny = p.y - cy, nl = Math.hypot(nx, ny) || 1;
              return (
                <g key={e.id} role="button" tabIndex={0} aria-pressed={sel} aria-label={e.label} onClick={() => onSelect(sel ? null : e.id)} onKeyDown={ev => (ev.key === 'Enter' || ev.key === ' ') && onSelect(sel ? null : e.id)} style={{ cursor: 'pointer' }}>
                  <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
                  {ring && <circle cx={p.x} cy={p.y} r={hetero ? 15 : 11} fill={sel ? C.biroWash : C.tickWash} stroke={ring} strokeWidth={2.5} />}
                  {hetero
                    ? <SvgText lines={[atomLabel(e.symbol!, hyd?.get(e.id) ?? 0, e.charge ?? 0)]} x={p.x} y={p.y} size={15} fill={HETERO_FILL[e.symbol!] ?? C.ink} />
                    : !ring && <circle cx={p.x} cy={p.y} r={2.6} fill={C.muted} />}
                  {!hetero && showLabels && e.short_label && (
                    <text x={p.x + (nx / nl) * 14} y={p.y + (ny / nl) * 14 + 3.5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={C.muted} style={{ pointerEvents: 'none', userSelect: 'none' }}>{e.short_label}</text>
                  )}
                  {!hetero && !showLabels && <title>{`Atom ${i + 1}`}</title>}
                </g>
              );
            })}
          </svg>
        )}
      </ZoomFrame>
      <p className="text-center text-xs text-muted">Corners are carbon atoms. Hydrogens on carbon are not drawn.{spec.elements.some(e => e.short_label) ? ' Tap a numbered carbon for details.' : ''}</p>
    </div>
  );
}
