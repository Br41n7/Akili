/** True for the errors a browser raises when a script file fails to download (slow network) or no longer exists (new deploy). */
export function isChunkLoadError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  const text = `${e?.name || ''} ${e?.message || ''}`;
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(text);
}

const KEY = 'akili_chunk_reload';
/** Reloads the page once for a chunk error. Returns false when it already tried in the last minute, so we never loop. */
export function reloadOnceForChunkError(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (last && now - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch { return false; }
  window.location.reload();
  return true;
}
