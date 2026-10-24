'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, Maximize2, Minimize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import { StaticVisual } from '@/components/visual/VisualRenderer';
import VisualRenderer from '@/components/visual/VisualRenderer';
import { safeVisualSpec } from '@/lib/visual/schema';
import { POSTER_WIDTH, sectionColor, splitSections, type Infographic, type InfoSection } from '@/lib/infographic';
import { fileNameFor } from '@/lib/study-artifacts';

const INK = '#16204A';

const Pill = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <h3 className="inline-block rounded-full px-3.5 py-1 text-[17px] font-bold leading-snug" style={{ background: color, color: INK }}>{children}</h3>
);

function SectionBlock({ s, i }: { s: InfoSection; i: number }) {
  return (
    <section className="space-y-1.5">
      <Pill color={sectionColor(i)}>{i + 1}. {s.heading}</Pill>
      <ul className="space-y-1 pl-1 text-[15px] leading-snug">
        {s.bullets.map((b, k) => (
          <li key={k} className="flex gap-2"><span aria-hidden>•</span><span>{b.text}
            {b.sub.length > 0 && <ul className="mt-0.5 space-y-0.5 pl-1 text-[14px]">{b.sub.map((t, j) => <li key={j} className="flex gap-2"><span aria-hidden>–</span><span>{t}</span></li>)}</ul>}
          </span></li>
        ))}
      </ul>
    </section>
  );
}

/** The poster itself: fixed width, so a downloaded image looks the same on every phone. */
export const Poster = ({ g, innerRef }: { g: Infographic; innerRef?: React.Ref<HTMLDivElement> }) => {
  const spec = safeVisualSpec(g.figure);
  const { left, right } = splitSections(g.sections, !!spec, g.key_points.length, g.extra?.items.length ?? 0);
  return (
    <div ref={innerRef} data-poster style={{ width: POSTER_WIDTH, background: '#FBFAF6', color: INK }} className="space-y-5 p-6 font-ui">
      <header className="text-center">
        <h2 className="font-read inline-block px-2 text-[34px] font-black leading-tight" style={{ background: 'linear-gradient(transparent 62%, #F5D547 62%)' }}>{g.title}</h2>
        {g.subtitle && <p className="mt-1 text-[16px]" style={{ color: '#5B6480' }}>{g.subtitle}</p>}
      </header>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="space-y-4">{left.map(i => <SectionBlock key={i} s={g.sections[i]} i={i} />)}</div>
        <div className="space-y-4">
          {spec && (
            <figure className="rounded-2xl border bg-white p-2" style={{ borderColor: '#DCE0E9' }}>
              <StaticVisual visualSpec={spec} />
              <figcaption className="px-1 pt-1 text-center text-[11px]" style={{ color: '#5B6480' }}>{spec.title} · simplified schematic</figcaption>
            </figure>
          )}
          {right.map(i => <SectionBlock key={i} s={g.sections[i]} i={i} />)}
          {g.key_points.length > 0 && (
            <section className="space-y-1.5"><Pill color="#CFE3FA">Key Points</Pill>
              <ul className="space-y-1 rounded-2xl border bg-white p-3 text-[15px] leading-snug" style={{ borderColor: '#DCE0E9' }}>{g.key_points.map((k, n) => <li key={n} className="flex gap-2"><span aria-hidden>•</span><span>{k}</span></li>)}</ul>
            </section>
          )}
          {g.extra && (
            <section className="space-y-1.5"><Pill color="#FBD5E4">{g.extra.title}</Pill>
              <ul className="space-y-1 rounded-2xl border bg-white p-3 text-[15px] leading-snug" style={{ borderColor: '#DCE0E9' }}>{g.extra.items.map((k, n) => <li key={n} className="flex gap-2"><span aria-hidden>•</span><span>{k}</span></li>)}</ul>
            </section>
          )}
        </div>
      </div>
      <footer className="border-t pt-2 text-center text-[11px]" style={{ borderColor: '#DCE0E9', color: '#5B6480' }}>Made with Akili · check against your own notes</footer>
    </div>
  );
};

export function InfographicView({ g }: { g: Infographic }) {
  const box = useRef<HTMLDivElement>(null);
  const poster = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(true);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  const [saving, setSaving] = useState(false);
  const spec = safeVisualSpec(g.figure);

  useLayoutEffect(() => {
    const measure = () => {
      if (box.current) setScale(fit ? Math.min(1, box.current.clientWidth / POSTER_WIDTH) : 1);
      if (poster.current) setHeight(poster.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current); if (poster.current) ro.observe(poster.current);
    return () => ro.disconnect();
  }, [fit, g]);
  useEffect(() => { /* re-measure after fonts load */ document.fonts?.ready.then(() => poster.current && setHeight(poster.current.offsetHeight)); }, []);

  const save = async () => {
    if (!poster.current) return;
    setSaving(true);
    try {
      const { toPng } = await import('html-to-image');
      const url = await toPng(poster.current, { pixelRatio: 2, backgroundColor: '#FBFAF6', cacheBust: true, style: { transform: 'none', margin: '0' } });
      const a = document.createElement('a'); a.href = url; a.download = fileNameFor(g.title, 'png'); a.click();
    } catch { toast.error('Could not make the image. Try again, or use Download text.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button loading={saving} onClick={save}><Download size={16} /> Download image</Button>
        <Button variant="quiet" onClick={() => setFit(f => !f)} aria-pressed={!fit}>{fit ? <><Maximize2 size={16} /> Actual size</> : <><Minimize2 size={16} /> Fit to screen</>}</Button>
      </div>
      <div ref={box} className="overflow-x-auto rounded-2xl border border-rule bg-chalk">
        <div style={{ height: height * scale, width: POSTER_WIDTH * scale }}>
          <div style={{ width: POSTER_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}><Poster g={g} innerRef={poster} /></div>
        </div>
      </div>
      {spec && (
        <details className="rounded-2xl border border-rule bg-paper p-3">
          <summary className="cursor-pointer text-sm font-bold">Explore the figure (tap parts, get quizzed)</summary>
          <div className="mt-3"><VisualRenderer visualSpec={spec} /></div>
        </details>
      )}
    </div>
  );
}

export default InfographicView;
