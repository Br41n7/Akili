'use client';
import { useEffect } from 'react';
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/chunk-error';

/**
 * Shown when a page crashes. A script that failed to download (weak network, or a new version went live while the page was
 * open) is reloaded once automatically. Anything else shows a plain message and the real error text, so a learner can send
 * a screenshot that says what went wrong. Plain styles on purpose: this must work even if the app's own styles failed.
 */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const chunk = isChunkLoadError(error);
  useEffect(() => { if (chunk) reloadOnceForChunkError(); }, [chunk]);
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '64px 20px', fontFamily: 'system-ui, sans-serif', color: '#1a2140' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{chunk ? 'The page did not finish loading' : 'Something went wrong'}</h1>
      <p style={{ lineHeight: 1.5 }}>
        {chunk ? 'Your connection may be slow, or Akili was just updated. Reload to get the latest version.' : 'This page ran into a problem. Reloading usually fixes it. Your work that was already saved is safe.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: '0 18px', borderRadius: 12, border: 0, background: '#1a2140', color: '#fff', fontWeight: 700 }}>Reload page</button>
        {reset && !chunk && <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 18px', borderRadius: 12, border: '1px solid #c9ccd6', background: '#fff', fontWeight: 700 }}>Try again</button>}
        <a href="/projects" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 12px', fontWeight: 700 }}>Go to projects</a>
      </div>
      <details style={{ marginTop: 24, fontSize: 12, color: '#5b6178' }}>
        <summary>Error details (send a screenshot of this if it keeps happening)</summary>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{`${error?.name || 'Error'}: ${error?.message || 'unknown'}${error?.digest ? `\nref: ${error.digest}` : ''}`}</pre>
      </details>
    </div>
  );
}
