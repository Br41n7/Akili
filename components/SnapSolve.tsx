'use client';
import { useRef, useState } from 'react';
import { callAIJSON, errorMessage } from '@/lib/utils';
import { Camera, Check, Copy, RefreshCw, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Field, GeneratingPanel, Segmented, TextArea } from '@/components/ui';
import {
  SNAP_MAX_BYTES, buildReadPrompt, buildSolvePrompt, checkImageFile, dataUrlToBase64, fitSize, needsCareful, solutionToText, READ_SYSTEM,
  type SnapMode, type SnapRead, type SnapSolution,
} from '@/lib/snap';

interface Props { projectId: string; region: string }
type Step = 'pick' | 'reading' | 'confirm' | 'solving' | 'done';

/** Shrink and re-encode as JPEG: smaller upload, and a format every provider accepts. */
async function prepare(file: File): Promise<{ preview: string; base64: string; mimeType: 'image/jpeg' }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('decode')); i.src = url; });
    const { width, height } = fitSize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
    for (const q of [0.85, 0.7, 0.55]) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (data.length * 0.75 <= SNAP_MAX_BYTES || q === 0.55) return { preview: data, base64: dataUrlToBase64(data), mimeType: 'image/jpeg' };
    }
    throw new Error('unreachable');
  } finally { URL.revokeObjectURL(url); }
}

export function SolutionView({ s, mode }: { s: SnapSolution; mode: SnapMode }) {
  return (
    <article className="space-y-3 rounded-2xl border border-rule bg-paper p-4 text-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-biro">{s.problem_type || 'Problem'}</p>
      <p><b>Concept: </b>{s.concept}</p>
      {s.explanation && <p className="whitespace-pre-line font-read leading-relaxed">{s.explanation}</p>}
      {mode === 'solve' && s.solution_steps.length > 0 && <ol className="list-decimal space-y-1.5 pl-5">{s.solution_steps.map((t, i) => <li key={i}>{t}</li>)}</ol>}
      {mode === 'solve' && s.final_answer && <p className="rounded-xl bg-tick-wash p-3 font-bold text-tick">Answer: {s.final_answer}</p>}
      {mode === 'solve' && s.shortcut_method && <p className="rounded-xl bg-marker-wash p-3"><b>Faster way: </b>{s.shortcut_method}</p>}
      {s.common_mistakes.length > 0 && <div><p className="font-bold">Common mistakes</p><ul className="list-disc pl-5">{s.common_mistakes.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
    </article>
  );
}

export function SnapSolve({ projectId, region }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [image, setImage] = useState<{ preview: string; base64: string; mimeType: 'image/jpeg' } | null>(null);
  const [read, setRead] = useState<SnapRead | null>(null);
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<SnapMode>('solve');
  const [solution, setSolution] = useState<SnapSolution | null>(null);
  const [solvedMode, setSolvedMode] = useState<SnapMode>('solve');
  const [error, setError] = useState('');

  const reset = () => { setStep('pick'); setImage(null); setRead(null); setQuestion(''); setSolution(null); setError(''); if (fileRef.current) fileRef.current.value = ''; };

  const onFile = async (file?: File) => {
    if (!file) return;
    const problem = checkImageFile(file); if (problem) { setError(problem); return; }
    setError(''); setStep('reading');
    try {
      const img = await prepare(file); setImage(img);
      const r = await callAIJSON<SnapRead>({ task: 'snap_read', prompt: buildReadPrompt(), systemInstruction: READ_SYSTEM, region, projectId, validationType: 'snap_read', image: { base64: img.base64, mimeType: img.mimeType } });
      if (!r.legible) { setError('That picture is too blurry, dark or cropped to read. Retake it closer, in good light, with the whole question in view.'); setStep('pick'); return; }
      setRead(r); setQuestion(r.question_text); setStep('confirm');
    } catch (e) {
      setError(e instanceof Error && e.name !== 'AIRequestError' && !(e as any).code ? 'That image could not be opened. Try a JPG or PNG.' : errorMessage(e, 'Could not read the picture. Please try again.')); setStep('pick');
    }
  };

  const solve = async () => {
    const q = question.trim(); if (!q || !read) return;
    setError(''); setStep('solving');
    try {
      let out: SnapSolution | null = null;
      // Solve mode must end in an answer; ask once more if the first reply has none.
      for (let attempt = 0; attempt < 2 && !out; attempt++) {
        const got = await callAIJSON<SnapSolution>({ task: 'snap_solve', prompt: buildSolvePrompt({ question: q, diagram: read.diagram_description, mode }) + (attempt ? '\n\nYour last reply had no final answer. Give the steps and the final answer.' : ''), region, projectId, validationType: 'snap_solve' });
        if (mode === 'explain' || (got.final_answer && got.solution_steps.length)) out = got;
      }
      if (!out) throw new Error('Akili could not reach a clear answer. Check the question text, or use Explain only.');
      setSolution(out); setSolvedMode(mode); setStep('done');
    } catch (e) { setError(errorMessage(e, 'Could not solve it. Please try again.')); setStep('confirm'); }
  };

  const busy = step === 'reading' || step === 'solving';
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take or choose a photo" onChange={e => onFile(e.target.files?.[0])} />

      {step === 'pick' && (
        <div className="space-y-3 rounded-2xl border border-rule bg-paper p-4 text-center">
          <Camera className="mx-auto text-biro" size={30} />
          <h2 className="font-bold">Snap a question</h2>
          <p className="text-sm text-muted">Photograph a printed or handwritten question. Akili reads it, you check the text, then it explains or solves.</p>
          <Button block onClick={() => fileRef.current?.click()}><Upload size={16} /> Take or choose a photo</Button>
          <p className="text-xs text-muted">Your photo is sent to the AI to be read and is not stored.</p>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-redpen-wash p-3 text-sm text-redpen">{error}</p>}
      {step === 'reading' && <GeneratingPanel title="Reading your photo" steps={['Opening the picture', 'Reading the question', 'Checking what is unclear']} />}

      {(step === 'confirm' || step === 'solving' || step === 'done') && image && read && (
        <div className="space-y-3">
          <img src={image.preview} alt="Your photographed question" className="max-h-56 w-full rounded-2xl border border-rule object-contain bg-chalk" />
          <div className="space-y-2 rounded-2xl border border-rule bg-paper p-4">
            <Field label="Check what Akili read, and fix any mistake" htmlFor="snap-q">
              <TextArea id="snap-q" rows={5} value={question} onChange={e => setQuestion(e.target.value)} maxLength={3000} disabled={busy} />
            </Field>
            {needsCareful(read) && (
              <div className="rounded-xl bg-marker-wash p-3 text-sm" role="note">
                <p className="font-bold">{read.confidence === 'high' ? 'Please double-check these parts:' : 'Akili is not fully sure it read this correctly.'}</p>
                {read.uncertain.length > 0 && <ul className="list-disc pl-5">{read.uncertain.map((u, i) => <li key={i}>{u}</li>)}</ul>}
              </div>
            )}
            {read.diagram_description && <p className="text-xs text-muted"><b>Diagram as read: </b>{read.diagram_description}</p>}
            <Segmented<SnapMode> label="What do you want?" value={mode} onChange={setMode} options={[{ value: 'solve', label: 'Solve it' }, { value: 'explain', label: 'Explain only' }]} />
            <Button block loading={step === 'solving'} disabled={!question.trim()} onClick={solve}><Check size={16} /> {mode === 'solve' ? 'Looks right, solve it' : 'Looks right, explain it'}</Button>
          </div>
        </div>
      )}
      {step === 'solving' && <GeneratingPanel title="Working it out" steps={['Understanding the question', 'Working through it', 'Checking the answer']} />}

      {step === 'done' && solution && (
        <div className="space-y-3">
          <SolutionView s={solution} mode={solvedMode} />
          <div className="flex gap-2">
            <Button variant="quiet" onClick={reset}><RefreshCw size={16} /> Another question</Button>
            <Button variant="quiet" aria-label="Copy" onClick={() => navigator.clipboard?.writeText(solutionToText(solution)).then(() => toast.success('Copied'), () => toast.error('Could not copy'))}><Copy size={16} /></Button>
          </div>
          <p className="text-xs text-muted">Check the answer against your own working. Akili can make mistakes, especially on diagrams.</p>
        </div>
      )}
    </div>
  );
}

export default SnapSolve;
