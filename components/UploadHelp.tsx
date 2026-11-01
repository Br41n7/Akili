'use client';
import { useEffect, useState } from 'react';
import { Camera, ExternalLink, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui';
import { isInAppBrowser } from '@/lib/file-types';

/**
 * Shown under the upload button. Some phones have no usable file manager, and browsers inside other apps
 * (Facebook, Instagram, TikTok...) often cannot open a file picker. This gives every learner a way forward.
 */
export default function UploadHelp({ onPhoto, onNotes }: { onPhoto?: () => void; onNotes?: () => void }) {
  const [inApp, setInApp] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { try { setInApp(isInAppBrowser(navigator.userAgent)); } catch { /* ignore */ } }, []);
  const copyLink = async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { /* ignore */ } };
  return (
    <div className="space-y-2">
      {inApp && (
        <div role="note" className="rounded-xl border border-marker bg-marker-wash p-3 text-sm">
          <p className="font-bold">You are inside another app&apos;s browser.</p>
          <p className="text-muted">It often cannot open your files. Open Akili in Chrome or Safari instead.</p>
          <Button variant="quiet" size="sm" className="mt-2" onClick={copyLink}><ExternalLink size={15} /> {copied ? 'Link copied. Paste it in Chrome' : 'Copy link'}</Button>
        </div>
      )}
      <details className="rounded-xl border border-rule p-3 text-sm">
        <summary className="min-h-9 cursor-pointer font-semibold">Cannot pick a file on your phone?</summary>
        <div className="space-y-2 pt-2 text-muted">
          <p>Your phone may not have a file manager, or it may be off. Any of these works:</p>
          <div className="flex flex-wrap gap-2">
            {onPhoto && <Button variant="quiet" size="sm" onClick={onPhoto}><Camera size={15} /> Take a photo of your notes</Button>}
            {onNotes && <Button variant="quiet" size="sm" onClick={onNotes}><StickyNote size={15} /> Paste text as a note</Button>}
          </div>
          <ul className="list-disc space-y-1 pl-5">
            <li>Install <span className="font-semibold text-ink">Files by Google</span> (Android) from your app store, then try again.</li>
            <li>Open Akili in Chrome, not inside another app.</li>
            <li>Paste a Google Docs or web link in the box above.</li>
          </ul>
        </div>
      </details>
    </div>
  );
}
