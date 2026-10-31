'use client';
import { useEffect, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Surface, TextInput } from '@/components/ui';
import { sendFeedback } from '@/components/FeedbackForm';

const key = (id: string) => `akili.rated.${id}`;
const rated = (id: string) => { try { return localStorage.getItem(key(id)) === '1'; } catch { return false; } };
const remember = (id: string) => { try { localStorage.setItem(key(id), '1'); } catch { /* fine */ } };

/** One tap after a lesson: was it clear? Asked once per lesson on this device. A thumbs-down offers a short reason. */
export default function LessonRating({ lessonId, page }: { lessonId: string; page?: string }) {
  const [hidden, setHidden] = useState(true); const [down, setDown] = useState(false); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setHidden(rated(lessonId)); setDown(false); setNote(''); }, [lessonId]);
  if (hidden) return null;
  const send = async (rating: number, message?: string) => {
    setBusy(true);
    const err = await sendFeedback({ kind: 'rating', rating, context: 'lesson', ref: lessonId.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 100), page, ...(message?.trim() ? { message } : {}) });
    setBusy(false);
    if (err) return void toast.error(err);
    remember(lessonId); setHidden(true); toast.success('Thanks for the feedback.');
  };
  return (
    <Surface className="space-y-3 p-4" aria-label="Rate this lesson">
      <p className="text-sm font-bold">Was this lesson clear?</p>
      {!down ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="quiet" loading={busy} onClick={() => send(5)}><ThumbsUp size={16} /> Yes</Button>
          <Button variant="quiet" disabled={busy} onClick={() => setDown(true)}><ThumbsDown size={16} /> Not really</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <TextInput value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="What was unclear? (optional)" aria-label="What was unclear" />
          <Button block loading={busy} onClick={() => send(1, note)}>Send</Button>
        </div>
      )}
    </Surface>
  );
}
