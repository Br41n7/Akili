'use client';
import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button, TextArea } from '@/components/ui';
import { sendFeedback } from '@/components/FeedbackForm';
import { MAX_MESSAGE } from '@/lib/feedback';

/** Diagrams are drawn by AI from a fixed set of shapes, so mistakes can happen. This sends one to the owner with the lesson and diagram it was about. */
export function reportBody(o: { lessonId: string; title: string; type?: string; note: string; page?: string }) {
  const head = `Diagram problem. Lesson: ${o.title}. Type: ${o.type || 'unknown'}. `;
  return { kind: 'bug' as const, context: 'lesson' as const, ref: `diagram:${o.lessonId}`.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 100), message: (head + o.note.trim()).slice(0, MAX_MESSAGE), ...(o.page ? { page: o.page } : {}) };
}

export default function ReportDiagram({ lessonId, lessonTitle, diagramType }: { lessonId: string; lessonTitle: string; diagramType?: string }) {
  const [open, setOpen] = useState(false); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false); const [error, setError] = useState('');
  const send = async () => {
    setBusy(true); setError('');
    const err = await sendFeedback(reportBody({ lessonId, title: lessonTitle, type: diagramType, note, page: typeof window !== 'undefined' ? window.location.pathname : undefined }));
    setBusy(false); if (err) setError(err); else setDone(true);
  };
  if (done) return <p className="mt-2 text-xs text-tick" role="status">Thank you. We will check this diagram.</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-xs text-muted underline"><Flag size={13} /> Something wrong with this diagram?</button>;
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-rule p-3">
      <label htmlFor={`rd-${lessonId}`} className="text-sm font-bold">What is wrong with the diagram?</label>
      <TextArea id={`rd-${lessonId}`} rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="For example: the label for the nucleus points to the wrong part" />
      {error && <p className="text-xs text-redpen" role="alert">{error}</p>}
      <div className="flex gap-2"><Button onClick={send} loading={busy} disabled={note.trim().length < 3}>Send report</Button><Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button></div>
    </div>
  );
}
