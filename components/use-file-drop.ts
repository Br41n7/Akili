'use client';
import { useEffect, useRef, useState, type DragEvent } from 'react';

/** True only when real files are being dragged (not selected text or a link). */
export const hasFiles = (e: { dataTransfer?: { types?: ArrayLike<string> | readonly string[] } | null }) => Array.from(e.dataTransfer?.types || []).includes('Files');
/** The files in a drop, or [] when the drop is not a file drop. */
export const droppedFiles = (e: { dataTransfer?: { types?: ArrayLike<string>; files?: ArrayLike<File> } | null }): File[] => (hasFiles(e) ? Array.from(e.dataTransfer?.files || []) : []);

/**
 * Drag-and-drop for computers. Spread `handlers` on the drop area; `over` is true while a file is dragged above it.
 * While mounted it also stops the browser from opening a file dropped anywhere else on the page, which would
 * otherwise navigate away from Akili and lose the learner's place.
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const stop = (e: Event) => { if (hasFiles(e as unknown as DragEvent)) e.preventDefault(); };
    window.addEventListener('dragover', stop); window.addEventListener('drop', stop);
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop); };
  }, []);
  const handlers = {
    onDragEnter: (e: DragEvent) => { if (!enabled || !hasFiles(e)) return; e.preventDefault(); depth.current++; setOver(true); },
    onDragOver: (e: DragEvent) => { if (!enabled || !hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; },
    onDragLeave: (e: DragEvent) => { if (!enabled || !hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return; e.preventDefault(); depth.current = 0; setOver(false);
      if (!enabled) return;
      const files = droppedFiles(e); if (files.length) onFiles(files);
    },
  };
  return { over, handlers };
}
