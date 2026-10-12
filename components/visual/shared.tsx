'use client';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;

/** New zoom for a two-finger gesture: scales with how far the fingers have moved apart or together. */
export function pinchZoom(startDist: number, curDist: number, startZoom: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
  if (!(startDist > 0) || !(curDist > 0)) return startZoom;
  return Math.min(max, Math.max(min, Math.round(startZoom * (curDist / startDist) * 100) / 100));
}

/**
 * Keeps the diagram inside the phone width by default. Pinch with two fingers, or use the buttons; zoomed
 * content scrolls inside this box, never the page. The frame blocks the browser's own page-pinch so the
 * gesture zooms the diagram instead of the whole screen.
 */
export function ZoomFrame({ children, label }: { children: (zoom: number) => ReactNode; label: string }) {
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const prev = useRef(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // Keep whatever is in the middle of the view in the middle while the content grows or shrinks.
  useLayoutEffect(() => {
    const el = box.current; const k = zoom / prev.current;
    if (el && k !== 1) {
      el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * k - el.clientWidth / 2;
      el.scrollTop = (el.scrollTop + el.clientHeight / 2) * k - el.clientHeight / 2;
    }
    prev.current = zoom;
  }, [zoom]);

  const spread = () => { const [a, b] = [...pointers.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const down = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { dist: spread(), zoom };
  };
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) setZoom(pinchZoom(pinch.current.dist, spread(), pinch.current.zoom));
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-end gap-1" aria-label={`${label} zoom`}>
        <span className="mr-auto text-xs text-muted">Pinch or use the buttons to zoom</span>
        <button type="button" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom(z => Math.max(ZOOM_MIN, Math.round((z - 0.5) * 100) / 100))} className="flex h-11 w-11 items-center justify-center rounded-lg border border-rule bg-paper disabled:opacity-40"><Minus size={16} /></button>
        <span className="w-12 text-center text-xs font-semibold text-muted" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom(z => Math.min(ZOOM_MAX, Math.round((z + 0.5) * 100) / 100))} className="flex h-11 w-11 items-center justify-center rounded-lg border border-rule bg-paper disabled:opacity-40"><Plus size={16} /></button>
      </div>
      <div ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        className="overflow-auto rounded-xl border border-rule bg-chalk" style={{ maxHeight: zoom > 1 ? '70vh' : undefined, touchAction: 'pan-x pan-y' }}>
        <div style={{ width: `${zoom * 100}%` }}>{children(zoom)}</div>
      </div>
    </div>
  );
}

/** Label shown for an element: its text, or a number when labels are hidden for self-testing. */
export const labelFor = (label: string, index: number, show: boolean) => (show ? label : String(index + 1));
