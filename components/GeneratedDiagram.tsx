'use client';

export interface DiagramLabel {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface GeneratedDiagramSpec {
  kind: 'skull' | 'heart' | 'cell' | 'amino_acid' | 'generic';
  title: string;
  labels: DiagramLabel[];
  note?: string;
}

/**
 * A deliberately schematic, responsive SVG for the legacy one-question visual quiz.
 * Geometry is controlled by the renderer, not arbitrary model coordinates, so labels
 * cannot be pushed off-screen on a phone. This is not a substitute for reviewed anatomy.
 */
export default function GeneratedDiagram({ spec }: { spec: GeneratedDiagramSpec }) {
  const labels = (spec.labels || []).slice(0, 5);
  const isAminoAcid = spec.kind === 'amino_acid';
  const generic = spec.kind === 'generic';
  const positions = isAminoAcid
    ? [{ x: 180, y: 64 }, { x: 276, y: 132 }, { x: 244, y: 238 }, { x: 116, y: 238 }]
    : labels.slice(0, 4).map((_, i) => ([{ x: 52, y: 62 }, { x: 52, y: 258 }, { x: 308, y: 62 }, { x: 308, y: 258 }][i]));

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-indigo-100 bg-white p-3">
      <p className="mb-2 text-sm font-bold leading-snug text-gray-600">AI-generated schematic: {spec.title}</p>
      <svg viewBox="0 0 360 320" preserveAspectRatio="xMidYMid meet" className="block h-auto w-full max-w-full rounded-xl border border-gray-200 bg-gray-50" role="img" aria-label={spec.title}>
        <rect x="1" y="1" width="358" height="318" rx="16" fill="#fafafa" stroke="#e5e7eb" />

        {spec.kind === 'skull' && <g>
          <ellipse cx="180" cy="132" rx="72" ry="78" fill="#f3f4f6" stroke="#374151" strokeWidth="3" />
          <path d="M128 190 Q180 235 232 190 L224 220 Q180 246 136 220 Z" fill="#e5e7eb" stroke="#374151" strokeWidth="3" />
          <ellipse cx="153" cy="132" rx="14" ry="11" fill="#374151" /><ellipse cx="207" cy="132" rx="14" ry="11" fill="#374151" />
          <path d="M180 142 L171 168 L189 168 Z" fill="#d1d5db" stroke="#374151" strokeWidth="2" />
        </g>}
        {spec.kind === 'heart' && <path d="M180 250 C160 225 82 172 94 116 C104 75 148 78 180 111 C212 78 256 75 266 116 C278 172 200 225 180 250 Z" fill="#fee2e2" stroke="#991b1b" strokeWidth="3" />}
        {spec.kind === 'cell' && <g>
          <ellipse cx="180" cy="160" rx="105" ry="76" fill="#ecfeff" stroke="#0f766e" strokeWidth="3" />
          <ellipse cx="180" cy="160" rx="34" ry="29" fill="#dbeafe" stroke="#1d4ed8" strokeWidth="3" />
          <circle cx="132" cy="129" r="9" fill="#fef3c7" stroke="#92400e" strokeWidth="2" /><circle cx="224" cy="189" r="9" fill="#fef3c7" stroke="#92400e" strokeWidth="2" />
        </g>}
        {generic && <g><rect x="92" y="102" width="176" height="116" rx="20" fill="#eef2ff" stroke="#4338ca" strokeWidth="3" /><text x="180" y="151" textAnchor="middle" fontSize="14" fontWeight="700" fill="#4338ca">CONCEPT</text><text x="180" y="174" textAnchor="middle" fontSize="10" fill="#4338ca">Schematic only</text></g>}

        {isAminoAcid && <g stroke="#4338ca" strokeWidth="2.5" fill="none" strokeLinecap="round">
          <line x1="180" y1="151" x2="180" y2="88" /><line x1="198" y1="160" x2="250" y2="132" />
          <line x1="190" y1="180" x2="224" y2="224" /><line x1="166" y1="180" x2="132" y2="224" />
          <circle cx="180" cy="164" r="25" fill="#e9ecfb" strokeWidth="3" />
          <text x="180" y="169" textAnchor="middle" stroke="none" fill="#16204a" fontSize="13" fontWeight="800">Cα</text>
        </g>}
        {isAminoAcid && labels.slice(0, 4).map((label, i) => {
          const pos = positions[i];
          const fallbackNames = ['Amino group (NH₂)', 'Carboxyl group (COOH)', 'Hydrogen (H)', 'R group'];
          const name = label.name || fallbackNames[i];
          const short = name.length > 18 ? name.slice(0, 16) + '…' : name;
          return <g key={`${label.id}-${i}`}>
            <rect x={pos.x - 49} y={pos.y - 20} width="98" height="40" rx="10" fill="white" stroke="#4f46e5" strokeWidth="2" />
            <text x={pos.x} y={pos.y - 2} textAnchor="middle" fontSize="10" fontWeight="800" fill="#4338ca">{label.id || ['I','II','III','IV'][i]}</text>
            <text x={pos.x} y={pos.y + 11} textAnchor="middle" fontSize="7.5" fill="#16204a">{short}</text>
          </g>;
        })}
        {!isAminoAcid && labels.slice(0, 4).map((label, i) => {
          const pos = positions[i];
          const ax = generic ? (pos.x < 180 ? 92 : 268) : 180;
          const ay = generic ? 160 : 132;
          return <g key={`${label.id}-${i}`}>
            <line x1={pos.x} y1={pos.y} x2={ax} y2={ay} stroke="#6366f1" strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx={pos.x} cy={pos.y} r="17" fill="white" stroke="#4f46e5" strokeWidth="2.5" />
            <text x={pos.x} y={pos.y + 5} textAnchor="middle" fontSize="12" fontWeight="800" fill="#4338ca">{label.id}</text>
          </g>;
        })}
        {isAminoAcid && <g>
          <line x1="180" y1="189" x2="180" y2="280" stroke="#14784c" strokeWidth="1.5" strokeDasharray="4 3" />
          <rect x="139" y="268" width="82" height="34" rx="10" fill="#e4f4ec" stroke="#14784c" strokeWidth="2.5" />
          <text x="180" y="289" textAnchor="middle" fontSize="12" fontWeight="800" fill="#14784c">V · α-carbon</text>
        </g>}
      </svg>
      {spec.note && <p className="mt-2 text-xs leading-relaxed text-gray-500">{spec.note}</p>}
      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">Schematic illustration; check the lesson explanation for scientific context.</p>
    </div>
  );
}
