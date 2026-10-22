'use client';
import { useState } from 'react';
import { layoutGraph, layoutMindMap, type KnowledgeGraph, type MindMap } from '@/lib/concept-maps';

const Lines = ({ lines, x, y, fill, size = 13, weight = 600 }: { lines: string[]; x: number; y: number; fill: string; size?: number; weight?: number }) => (
  <text x={x} y={y - ((lines.length - 1) * (size + 2)) / 2} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={weight} fill={fill}>
    {lines.map((l, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : size + 2}>{l}</tspan>)}
  </text>
);
const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => { const mx = (a.x + b.x) / 2; return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`; };

export function MindMapView({ m }: { m: MindMap }) {
  const L = layoutMindMap(m);
  const [sel, setSel] = useState<number | null>(null);
  const note = sel !== null ? L.nodes[sel]?.note : '';
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-2xl border border-rule bg-paper">
        <svg viewBox={`0 0 ${L.width} ${L.height}`} role="img" aria-label={`Mind map: ${m.center}`} className="min-w-[640px] w-full">
          {L.links.map((l, i) => <path key={i} d={curve(l.from, l.to)} fill="none" stroke="#B9C0D6" strokeWidth={2} />)}
          <rect x={L.center.x} y={L.center.y} width={L.center.w} height={L.center.h} rx={14} fill="#16204A" />
          <Lines lines={L.center.lines} x={L.center.x + L.center.w / 2} y={L.center.y + L.center.h / 2} fill="#fff" size={15} weight={700} />
          {L.nodes.map((n, i) => (
            <g key={i} onClick={() => setSel(sel === i ? null : i)} className="cursor-pointer" role="button" tabIndex={0} aria-label={n.lines.join(' ')}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSel(sel === i ? null : i)}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10} fill={n.level === 1 ? '#E9ECFB' : '#fff'} stroke={sel === i ? '#2F45D0' : n.level === 1 ? '#2F45D0' : '#DCE0E9'} strokeWidth={sel === i ? 3 : 1.5} />
              <Lines lines={n.lines} x={n.x + n.w / 2} y={n.y + n.h / 2} fill="#16204A" size={n.level === 1 ? 13 : 12} weight={n.level === 1 ? 700 : 500} />
            </g>
          ))}
        </svg>
      </div>
      <p className="min-h-5 text-sm text-muted" aria-live="polite">{note || 'Tap a box to read its note.'}</p>
    </div>
  );
}

export function KnowledgeGraphView({ g }: { g: KnowledgeGraph }) {
  const L = layoutGraph(g);
  const [sel, setSel] = useState<string | null>(null);
  const name = new Map(g.nodes.map(n => [n.id, n.label]));
  const related = sel ? g.edges.filter(e => e.from === sel || e.to === sel) : [];
  const touched = new Set(related.flatMap(e => [e.from, e.to]));
  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded-2xl border border-rule bg-paper">
        <svg viewBox={`0 0 ${L.width} ${L.height}`} role="img" aria-label={`Knowledge graph: ${g.title}`} className="min-w-[640px] w-full">
          <defs><marker id="kg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8791B0" /></marker></defs>
          {L.edges.map((e, i) => {
            const ge = g.edges[i]; const on = !sel || ge.from === sel || ge.to === sel;
            return <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={on ? '#8791B0' : '#E3E6EF'} strokeWidth={on ? 2 : 1} markerEnd="url(#kg-arrow)" />;
          })}
          {L.edges.map((e, i) => {
            const ge = g.edges[i]; if (sel && ge.from !== sel && ge.to !== sel) return null;
            return <text key={i} x={e.mx} y={e.my} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#5B6480" stroke="#fff" strokeWidth={4} paintOrder="stroke">{e.relation}</text>;
          })}
          {L.nodes.map(n => (
            <g key={n.id} onClick={() => setSel(sel === n.id ? null : n.id)} className="cursor-pointer" role="button" tabIndex={0} aria-label={n.lines.join(' ')}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSel(sel === n.id ? null : n.id)}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10} fill={sel === n.id ? '#2F45D0' : touched.has(n.id) ? '#E9ECFB' : '#fff'} stroke={sel && !touched.has(n.id) ? '#DCE0E9' : '#2F45D0'} strokeWidth={1.5} />
              <Lines lines={n.lines} x={n.x + n.w / 2} y={n.y + n.h / 2} fill={sel === n.id ? '#fff' : '#16204A'} size={12} />
            </g>
          ))}
        </svg>
      </div>
      <div className="min-h-5 text-sm text-muted" aria-live="polite">
        {sel ? <ul className="space-y-0.5">{related.map((e, i) => <li key={i}>{name.get(e.from)} <em>{e.relation}</em> {name.get(e.to)}</li>)}</ul> : 'Tap a concept to see how it connects.'}
      </div>
    </div>
  );
}
