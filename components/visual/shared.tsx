'use client';
import { useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisualSpec } from '@/lib/visual/schema';

export interface DiagramProps {
  spec: VisualSpec;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Elements to emphasise after a quiz answer. */
  highlightIds?: string[];
  showLabels: boolean;
}

/** Colours come from Akili's palette (tailwind.config.ts). SVG needs raw hex. */
export const C = {
  ink: '#16204A', muted: '#5B6480', rule: '#DCE0E9', chalk: '#F4F5F7', paper: '#FFFFFF',
  biro: '#2F45D0', biroWash: '#E9ECFB', marker: '#F5D547', markerWash: '#FDF6D3',
  tick: '#14784C', tickWash: '#E4F4EC', red: '#C7342A', redWash: '#FBE9E7',
};

/** Tailwind classes for a tappable HTML node. */
export const nodeClass = (selected: boolean, highlighted = false) =>
  cn(
    'w-full rounded-xl border-2 text-left transition-colors min-h-12 px-3.5 py-2.5',
    selected ? 'border-biro bg-biro-wash' : highlighted ? 'border-tick bg-tick-wash' : 'border-rule bg-paper active:bg-chalk',
  );

/** Multi-line SVG text, centred. */
export function SvgText({ lines, x, y, size = 13, weight = 700, fill = C.ink, lineH = 15 }: { lines: string[]; x: number; y: number; size?: number; weight?: number; fill?: string; lineH?: number }) {
  const startY = y - ((lines.length - 1) * lineH) / 2;
  return (
    <text x={x} textAnchor="middle" fontSize={size} fontWeight={weight} fill={fill} style={{ pointerEvents: 'none', userSelect: 'none' }}>
      {lines.map((l, i) => <tspan key={i} x={x} y={startY + i * lineH + size * 0.35}>{l}</tspan>)}
    </text>
  );
}

/**
 * Keeps the diagram inside the phone width by default and offers zoom, which scrolls
 * inside this box instead of making the page scroll sideways.
 */
export function ZoomFrame({ children, label }: { children: (zoom: number) => ReactNode; label: string }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-end gap-1" aria-label={`${label} zoom`}>
        <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="flex h-11 w-11 items-center justify-center rounded-lg border border-rule bg-paper disabled:opacity-40"><Minus size={16} /></button>
        <span className="w-12 text-center text-xs font-semibold text-muted">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" disabled={zoom >= 2.5} onClick={() => setZoom(z => Math.min(2.5, z + 0.5))} className="flex h-11 w-11 items-center justify-center rounded-lg border border-rule bg-paper disabled:opacity-40"><Plus size={16} /></button>
      </div>
      <div className="overflow-auto rounded-xl border border-rule bg-chalk" style={{ maxHeight: zoom > 1 ? '70vh' : undefined, touchAction: zoom > 1 ? 'pan-x pan-y' : 'pan-y' }}>
        <div style={{ width: `${zoom * 100}%` }}>{children(zoom)}</div>
      </div>
    </div>
  );
}

/** Label shown for an element: its text, or a number when labels are hidden for self-testing. */
export const labelFor = (label: string, index: number, show: boolean) => (show ? label : String(index + 1));
