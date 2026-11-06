/**
 * Browser only: finds out whether a PDF is scanned and, if so, reads its pages with text recognition (tesseract.js).
 * Everything happens on the learner's device: the PDF is not uploaded, no AI request is used, and only the text is saved.
 * The decision logic lives in lib/scan-ocr.ts (tested). Drawing pages and running the OCR engine here were NOT run in a real
 * browser during development: they must be checked on a real phone and computer.
 */
import { looksScanned, ocrPages, samplePages, type OcrResult } from '@/lib/scan-ocr';

async function openPdf(file: File) {
  const pdfjs: any = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

/** Looks at a few pages. Any failure answers "not scanned", so the normal upload path runs as before. */
export async function probePdf(file: File): Promise<{ scanned: boolean; numPages: number }> {
  try {
    const doc = await openPdf(file); const counts: number[] = [];
    for (const p of samplePages(doc.numPages)) {
      const page = await doc.getPage(p); const content = await page.getTextContent();
      counts.push(content.items.reduce((n: number, it: any) => n + (typeof it.str === 'string' ? it.str.trim().length : 0), 0)); page.cleanup?.();
    }
    const numPages = doc.numPages; await doc.destroy?.();
    return { scanned: looksScanned(counts), numPages };
  } catch { return { scanned: false, numPages: 0 }; }
}

/** Tesseract language codes for the interface languages, English always included. */
export const OCR_LANGS: Record<string, string> = { en: 'eng', fr: 'fra', es: 'spa', pt: 'por', ar: 'ara', sw: 'swa', ha: 'hau', yo: 'yor', ig: 'ibo' };
export const ocrLanguages = (lang: string) => Array.from(new Set(['eng', OCR_LANGS[lang] || 'eng']));

export async function ocrPdf(file: File, o: { langs?: string[]; onProgress?: (done: number, total: number) => void; signal?: AbortSignal; maxPages?: number } = {}): Promise<OcrResult> {
  const doc = await openPdf(file);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker((o.langs?.length ? o.langs : ['eng']).join('+'), 1);
  const canvas = document.createElement('canvas');
  try {
    return await ocrPages({
      numPages: doc.numPages, onProgress: o.onProgress, signal: o.signal, maxPages: o.maxPages,
      render: async (n: number) => {
        const page = await doc.getPage(n); const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(3, Math.max(1, 1800 / base.width)) }); // about 1800 px wide reads well without using much memory
        canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise; page.cleanup?.();
        return canvas;
      },
      recognize: async (image: unknown) => { const { data } = await worker.recognize(image as HTMLCanvasElement); return { text: data.text || '', confidence: data.confidence ?? 0 }; },
    });
  } finally { canvas.width = canvas.height = 0; await worker.terminate().catch(() => {}); await doc.destroy?.(); }
}
