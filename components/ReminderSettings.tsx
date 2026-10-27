'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import { capabilities } from '@/lib/plan';
import { hourLabel, reminderSupport, urlBase64ToUint8Array, type SupportState } from '@/lib/reminders';

interface Props { enabled: boolean; hour: number }
const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const MESSAGES: Record<Exclude<SupportState, 'ok'>, string> = {
  unconfigured: 'Reminders are not switched on for this app yet. The site owner needs to add the notification keys.',
  unsupported: 'This browser cannot show reminders. Try Chrome on Android or a desktop browser.',
  ios_install: 'On iPhone, reminders only work from the Home Screen. Tap Share, choose Add to Home Screen, open Akili from there, then come back here.',
  denied: 'Notifications are blocked for Akili. Allow them in your browser settings for this site, then reload.',
  no_worker: 'Reminders work in the installed or live version of Akili. Reload the page once, then try again.',
};

const put = (body: object) => fetch('/api/profiles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const HOURLY = capabilities().has('hourly_reminders');

export default function ReminderSettings({ enabled: initialEnabled, hour: initialHour }: Props) {
  const [support, setSupport] = useState<SupportState | 'checking'>('checking');
  const [on, setOn] = useState(false);
  const [hour, setHour] = useState(initialHour);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const hasSW = 'serviceWorker' in navigator;
      const reg = hasSW ? await navigator.serviceWorker.getRegistration() : undefined;
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      setSupport(reminderSupport({
        hasKey: !!KEY, hasServiceWorker: hasSW, hasPush: 'PushManager' in window, hasNotification: 'Notification' in window,
        isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent), standalone, permission: 'Notification' in window ? Notification.permission : 'default', hasRegistration: !!reg,
      }));
      const sub = await reg?.pushManager?.getSubscription();
      setOn(initialEnabled && !!sub);
    })().catch(() => setSupport('unsupported'));
  }, [initialEnabled]);

  const enable = async () => {
    setBusy(true);
    let sub: PushSubscription | null = null;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) { setSupport('no_worker'); return; }
      // Asked here, from a tap, never on page load.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setSupport(permission === 'denied' ? 'denied' : 'ok'); toast('Reminders stay off until you allow notifications.'); return; }
      sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(KEY) as BufferSource });
      const saved = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!saved.ok) throw new Error('subscribe');
      const settings = await put({ reminders_enabled: true, reminder_hour: hour, reminder_tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      if (!settings.ok) throw new Error('settings');
      setOn(true); toast.success(HOURLY ? `Reminders on, daily at ${hourLabel(hour)}` : 'Reminders on, once a day');
    } catch {
      // Do not leave a half-set-up device that the server does not know about.
      await sub?.unsubscribe().catch(() => {});
      toast.error('Could not turn reminders on. Please try again.');
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      const r = await put({ reminders_enabled: false });
      if (!r.ok) throw new Error();
      setOn(false); toast.success('Reminders off');
    } catch { toast.error('Could not turn reminders off. Please try again.'); }
    finally { setBusy(false); }
  };

  const changeHour = async (h: number) => {
    const before = hour; setHour(h);
    const r = await put({ reminder_hour: h, reminder_tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => null);
    if (!r?.ok) { setHour(before); toast.error('Could not save the time.'); } else toast.success(`Daily at ${hourLabel(h)}`);
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/push/test', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'failed');
      toast.success('Sent. It should appear in a few seconds.');
    } catch (e) { toast.error(e instanceof Error && e.message !== 'failed' ? e.message : 'The test could not be sent.'); }
    finally { setBusy(false); }
  };

  if (support === 'checking') return <p className="text-sm text-muted">Checking this device…</p>;
  if (support !== 'ok') return <p role="status" className="rounded-xl bg-marker-wash p-3 text-sm">{MESSAGES[support]}</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">One short nudge a day: flashcards that are due, or a concept to practise. Nothing else, and you can stop it any time.</p>
      {HOURLY ? (
        <>
      <label className="block text-sm font-bold" htmlFor="rem-hour">Remind me at</label>
      <select id="rem-hour" value={hour} onChange={e => changeHour(Number(e.target.value))} disabled={busy || !on} className="min-h-12 w-full rounded-xl border border-rule bg-paper px-3 text-base disabled:opacity-60">
        {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
      </select>
      {!on && <p className="text-xs text-muted">Choose a time after you turn reminders on.</p>}
        </>
      ) : <p className="text-xs text-muted">You will get it once a day, in the late afternoon.</p>}
      {on ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="quiet" loading={busy} onClick={test}><Send size={16} /> Send a test</Button>
          <Button variant="ghost" loading={busy} onClick={disable}><BellOff size={16} /> Turn off</Button>
        </div>
      ) : (
        <Button block loading={busy} onClick={enable}><Bell size={16} /> Turn on reminders</Button>
      )}
    </div>
  );
}
