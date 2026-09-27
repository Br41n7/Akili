'use client';

export interface DiagramLabel {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface GeneratedDiagramSpec {
  kind: 'skull' | 'heart' | 'cell' | 'generic';
  title: string;
  labels: DiagramLabel[];
  note?: string;
}

export default function GeneratedDiagram({ spec }: { spec: GeneratedDiagramSpec }) {
  const labels = spec.labels || [];

  return (
    <div className="bg-white border border-indigo-100 rounded-2xl p-3 overflow-x-auto">
      <p className="text-xs font-bold text-gray-500 mb-2">AI-generated schematic: {spec.title}</p>
      <svg viewBox="0 0 720 460" className="w-full min-w-[520px] h-auto" role="img" aria-label={spec.title}>
        <rect x="1" y="1" width="718" height="458" rx="22" fill="#fafafa" stroke="#e5e7eb" />

        {spec.kind === 'skull' && (
          <>
            <ellipse cx="360" cy="205" rx="155" ry="145" fill="#f3f4f6" stroke="#374151" strokeWidth="4" />
            <path d="M250 300 Q360 390 470 300 L455 355 Q360 405 265 355 Z" fill="#e5e7eb" stroke="#374151" strokeWidth="4" />
            <ellipse cx="305" cy="205" rx="30" ry="22" fill="#374151" />
            <ellipse cx="415" cy="205" rx="30" ry="22" fill="#374151" />
            <path d="M360 225 L342 270 L378 270 Z" fill="#d1d5db" stroke="#374151" strokeWidth="3" />
            <path d="M315 315 Q360 335 405 315" fill="none" stroke="#374151" strokeWidth="3" />
          </>
        )}

        {spec.kind === 'heart' && (
          <path d="M360 365 C330 330 215 255 235 165 C250 100 325 105 360 155 C395 105 470 100 485 165 C505 255 390 330 360 365 Z" fill="#fee2e2" stroke="#991b1b" strokeWidth="4" />
        )}

        {spec.kind === 'cell' && (
          <>
            <ellipse cx="360" cy="230" rx="190" ry="140" fill="#ecfeff" stroke="#0f766e" strokeWidth="4" />
            <ellipse cx="360" cy="230" rx="62" ry="52" fill="#dbeafe" stroke="#1d4ed8" strokeWidth="4" />
            <circle cx="275" cy="175" r="16" fill="#fef3c7" stroke="#92400e" strokeWidth="3" />
            <circle cx="440" cy="280" r="16" fill="#fef3c7" stroke="#92400e" strokeWidth="3" />
          </>
        )}

        {spec.kind === 'generic' && (
          <>
            <rect x="245" y="115" width="230" height="230" rx="32" fill="#eef2ff" stroke="#4338ca" strokeWidth="4" />
            <text x="360" y="238" textAnchor="middle" fontSize="22" fontWeight="700" fill="#4338ca">CONCEPT</text>
          </>
        )}

        {labels.map((label, index) => {
          const x = Math.max(30, Math.min(690, Number(label.x) || 100));
          const y = Math.max(45, Math.min(410, Number(label.y) || 100));
          const anchorX = spec.kind === 'generic' ? 360 : 360;
          const anchorY = spec.kind === 'generic' ? 230 : 230;
          return (
            <g key={label.id || index}>
              <line x1={x} y1={y} x2={anchorX + (x < 360 ? -55 : 55)} y2={anchorY} stroke="#6366f1" strokeWidth="2" strokeDasharray="5 4" />
              <circle cx={x} cy={y} r="18" fill="white" stroke="#4f46e5" strokeWidth="3" />
              <text x={x} y={y + 6} textAnchor="middle" fontSize="15" fontWeight="800" fill="#4338ca">{label.id}</text>
            </g>
          );
        })}
      </svg>
      {spec.note && <p className="text-[11px] text-gray-400 mt-2">{spec.note}</p>}
    </div>
  );
}
