'use client';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const DISMISS_KEY = 'akili_install_dismissed';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Registers the service worker (production only) and offers "Install app" where the browser supports it. */
export default function PWA() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* app works without it */ });
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (read(DISMISS_KEY)) return;
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  if (!evt) return null;
  const dismiss = () => { write(DISMISS_KEY, '1'); setEvt(null); };
  const install = async () => { try { await evt.prompt(); await evt.userChoice; } finally { setEvt(null); } };

  return (
    <div role="dialog" aria-label="Install Akili" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-ink p-3 text-white shadow-lg md:bottom-4">
      <Download size={20} className="shrink-0 text-marker" />
      <p className="min-w-0 flex-1 text-sm">Install Akili for quick access from your home screen.</p>
      <button onClick={install} className="min-h-10 rounded-lg bg-marker px-3 text-sm font-bold text-ink">Install</button>
      <button onClick={dismiss} aria-label="Not now" className="flex h-10 w-10 items-center justify-center rounded-lg text-white/70"><X size={16} /></button>
    </div>
  );
}
