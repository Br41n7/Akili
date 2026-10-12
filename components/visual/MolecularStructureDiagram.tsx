'use client';
import { moleculeLayout, wrapLabel, VIEW_W } from '@/lib/visual/layout';
import { C, SvgText, ZoomFrame, type DiagramProps } from './shared';

// Conventional element colours, softened to sit with Akili's palette.
const ELEMENT_FILL: Record<string, string> = { C: '#E5E7EB', H: '#FFFFFF', N: '#DCE3FF', O: '#FBD5D0', S: '#FBEFB0', P: '#FFE0B8' };

/**
 * Atoms and functional groups as nodes, bonds as lines. Bond order draws as 1–3 parallel lines; peptide
 * and hydrogen bonds are styled so they can be told apart. Geometry is a schematic layout from the spec,
 * not a computed 3D structure.
 */
export default function MolecularStructureDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels }: DiagramProps) {
  const { points, height } = moleculeLayout(spec);
  const pos = new Map(points.map(p => [p.id, p]));
  const el = new Map(spec.elements.map(e => [e.id, e]));
  const bonds = spec.relationships.filter(r => r.relation === 'bonded_to' && pos.has(r.from) && pos.has(r.to));
  const nodeR = (id: string) => (el.get(id)?.symbol ? 17 : 0);
  const H = Math.max(180, height + 10);

  return (
    <ZoomFrame label="Molecule diagram">
      {() => (
        <svg viewBox={`0 0 ${VIEW_W} ${H}`} className="h-auto w-full" role="group" aria-label={`${spec.title}. Simplified structural schematic.`}>
          {bonds.map((b, i) => {
            const a = pos.get(b.from)!, c = pos.get(b.to)!;
            const dx = c.x - a.x, dy = c.y - a.y; const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len, ny = dx / len;
            const order = b.bond_kind === 'hydrogen' || b.bond_kind === 'ionic' ? 1 : (b.bond_order ?? 1);
            const offs = order === 1 ? [0] : order === 2 ? [-3.5, 3.5] : [-5, 0, 5];
            const active = selectedId === b.from || selectedId === b.to;
            const peptide = b.bond_kind === 'peptide';
            const stroke = peptide ? C.red : active ? C.biro : C.ink;
            return (
              <g key={i}>
                {offs.map((o, k) => <line key={k} x1={a.x + nx * o} y1={a.y + ny * o} x2={c.x + nx * o} y2={c.y + ny * o} stroke={stroke} strokeWidth={peptide ? 3.5 : 2.5} strokeDasharray={b.bond_kind === 'hydrogen' ? '4 4' : undefined} strokeLinecap="round" />)}
                {(peptide || b.label) && showLabels && <text x={(a.x + c.x) / 2 + nx * 14} y={(a.y + c.y) / 2 + ny * 14} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={peptide ? C.red : C.muted}>{b.label || 'peptide bond'}</text>}
              </g>
            );
          })}
          {spec.elements.map((e, i) => {
            const p = pos.get(e.id); if (!p) return null;
            const sel = selectedId === e.id, hi = highlightIds.includes(e.id);
            const stroke = sel ? C.biro : hi ? C.tick : C.ink;
            const atom = !!e.symbol;
            const text = atom ? `${e.symbol}${e.charge ? (e.charge > 0 ? '+' : '−') : ''}` : (showLabels ? (e.short_label || e.label) : String(i + 1));
            const lines = atom ? [text] : wrapLabel(text, 14, 2);
            const w = atom ? 0 : 108;
            return (
              <g key={e.id} role="button" tabIndex={0} aria-pressed={sel} aria-label={e.label} onClick={() => onSelect(sel ? null : e.id)} onKeyDown={ev => (ev.key === 'Enter' || ev.key === ' ') && onSelect(sel ? null : e.id)} style={{ cursor: 'pointer' }}>
                {atom ? (
                  <>
                    <circle cx={p.x} cy={p.y} r={nodeR(e.id) + 6} fill="transparent" />
                    <circle cx={p.x} cy={p.y} r={nodeR(e.id)} fill={sel ? C.biroWash : ELEMENT_FILL[e.symbol!] ?? '#F3F4F6'} stroke={stroke} strokeWidth={sel ? 3.5 : 2} />
                  </>
                ) : (
                  <>
                    <rect x={p.x - w / 2 - 3} y={p.y - 25} width={w + 6} height={50} fill="transparent" />
                    <rect x={p.x - w / 2} y={p.y - 22} width={w} height={44} rx={12} fill={sel ? C.biroWash : hi ? C.tickWash : C.paper} stroke={stroke} strokeWidth={sel ? 3 : 2} />
                  </>
                )}
                <SvgText lines={lines} x={p.x} y={p.y} size={atom ? 14 : 12.5} />
              </g>
            );
          })}
        </svg>
      )}
    </ZoomFrame>
  );
}
