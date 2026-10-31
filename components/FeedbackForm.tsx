'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, ChoiceChips, Field, Surface, TextArea } from '@/components/ui';
import { MAX_MESSAGE, type FeedbackKind } from '@/lib/feedback';

export async function sendFeedback(body: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return null; return (await r.json().catch(() => ({})))?.error || 'We could not send that. Please try again.';
  } catch { return 'No connection. Please try again.'; }
}

/** A full feedback form for Settings: what kind, an optional star rating, and a message. */
export default function FeedbackForm() {
  const page = usePathname();
  const [kind, setKind] = useState<Exclude<FeedbackKind, 'rating'>>('general');
  const [stars, setStars] = useState(0); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const submit = async () => {
    setBusy(true);
    const err = await sendFeedback({ kind, message, ...(stars ? { rating: stars } : {}), context: 'app', page });
    setBusy(false);
    if (err) return void toast.error(err);
    setSent(true); setMessage(''); setStars(0);
  };
  if (sent) return (
    <Surface className="space-y-2 p-4"><h2 className="text-base font-bold">Thank you</h2><p className="text-sm text-muted">Your feedback was sent. It helps decide what we fix and build next.</p><Button variant="quiet" onClick={() => setSent(false)}>Send more</Button></Surface>
  );
  return (
    <Surface className="space-y-4 p-4">
      <div><h2 className="text-base font-bold">Send feedback</h2><p className="text-sm text-muted">What is working, what is confusing, what is missing? Short is fine.</p></div>
      <ChoiceChips label="Type of feedback" value={kind} onChange={v => setKind(v as typeof kind)} options={[{ value: 'general', label: 'General' }, { value: 'idea', label: 'Idea' }, { value: 'bug', label: 'Problem' }]} />
      <div>
        <p className="mb-1 text-sm font-bold">How is Akili for you so far? <span className="font-normal text-muted">(optional)</span></p>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating out of 5">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setStars(stars === n ? 0 : n)} className="flex h-11 w-11 items-center justify-center rounded-lg">
              <Star size={24} className={n <= stars ? 'fill-marker text-marker' : 'text-muted'} />
            </button>
          ))}
        </div>
      </div>
      <Field label="Your message" htmlFor="fb-msg" hint="Please do not include passwords or private details.">
        <TextArea id="fb-msg" rows={4} maxLength={MAX_MESSAGE} value={message} onChange={e => setMessage(e.target.value)} placeholder={kind === 'bug' ? 'What happened, and what did you expect?' : 'Tell us what you think'} />
      </Field>
      <Button block loading={busy} disabled={message.trim().length < 3} onClick={submit}>Send feedback</Button>
    </Surface>
  );
}
