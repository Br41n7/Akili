'use client';
import { C, type DiagramProps } from './shared';

/** Small line/bar chart drawn from the spec's own data points. Nothing is fetched or computed beyond scaling. */
export default function GraphDiagram({ spec }: DiagramProps) {
  const g = spec.graph; if (!g) return null;
  const W = 360, H = 250, L = 44, R = 14, T = 16, B = 52;
  const ys = g.points.map(p => p.y);
  const lo = Math.min(0, ...ys), hi = Math.max(...ys) === lo ? lo + 1 : Math.max(...ys);
  const sx = (i: number) => L + (g.points.length === 1 ? 0 : (i * (W - L - R)) / (g.points.length - 1));
  const bw = (W - L - R) / g.points.length;
  const bx = (i: number) => L + i * bw + bw / 2;
  const sy = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : String(Math.round(n * 100) / 100));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-xl border border-rule bg-paper" role="img" aria-label={`${spec.title}: ${g.y_label} against ${g.x_label}`}>
      {[0, 0.5, 1].map(t => { const v = lo + t * (hi - lo); return <g key={t}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke={C.rule} /><text x={L - 6} y={sy(v) + 4} textAnchor="end" fontSize={10.5} fill={C.muted}>{fmt(v)}</text></g>; })}
      {g.kind === 'bar'
        ? g.points.map((p, i) => <rect key={i} x={bx(i) - bw * 0.3} y={Math.min(sy(p.y), sy(0))} width={bw * 0.6} height={Math.abs(sy(p.y) - sy(0))} fill={C.biro} rx={3} />)
        : <>
            <polyline points={g.points.map((p, i) => `${sx(i)},${sy(p.y)}`).join(' ')} fill="none" stroke={C.biro} strokeWidth={3} strokeLinejoin="round" />
            {g.points.map((p, i) => <circle key={i} cx={sx(i)} cy={sy(p.y)} r={4.5} fill={C.biro} />)}
          </>}
      {g.points.map((p, i) => <text key={i} x={g.kind === 'bar' ? bx(i) : sx(i)} y={H - B + 16} textAnchor="middle" fontSize={10.5} fill={C.ink}>{p.label}</text>)}
      <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={C.muted}>{g.x_label}</text>
      <text transform={`translate(11 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={C.muted}>{g.y_label}</text>
    </svg>
  );
}
