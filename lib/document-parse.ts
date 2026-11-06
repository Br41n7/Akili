import { decodeEntities, stripTags } from '@/lib/text-safe';
import { runAI } from '@/lib/ai';
import { chunkText, cleanText } from '@/lib/text-chunks';
export { chunkText, cleanText };

/** Thrown with a message that is safe to show the learner. */
export class ParseError extends Error { constructor(message: string, public status = 422) { super(message); } }

async function extractTextFromPptx(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/i.test(f));
  slideFiles.sort((a, b) => parseInt(a.match(/\d+/)?.[0] || '0', 10) - parseInt(b.match(/\d+/)?.[0] || '0', 10));
  const out: string[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('text');
    const content = (xml.match(/<a:t[^>]*>(.*?)<\/a:t>/gi) || []).map(m => decodeEntities(stripTags(m)).trim()).filter(Boolean).join(' ');
    if (content) out.push(`--- Slide ${i + 1} ---\n${content}`);
  }
  return out.join('\n\n');
}

/** Same as pdf-parse's own page text, with a "[Page N]" line first so lessons can say where in the file something is. */
export function renderPageWithNumber(pageData: any): Promise<string> {
  return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((content: any) => {
    let lastY: number | undefined; let text = '';
    for (const item of content.items) { if (lastY === item.transform[5] || lastY === undefined) text += item.str; else text += '\n' + item.str; lastY = item.transform[5]; }
    return `[Page ${pageData.pageNumber ?? (pageData.pageIndex ?? 0) + 1}]\n${text}`;
  });
}

/** Reads one uploaded file (already in memory) and returns clean text, a 12,000-character preview and chunks. */
export async function parseDocument(buffer: Buffer, ext: string, mimeType?: string): Promise<{ content: string; chunks: string[] }> {
  let text = '';
  if (ext === 'doc') throw new ParseError('Legacy .doc format is not supported directly. Please convert it to .docx or PDF and try again.');
  if (ext === 'ppt') throw new ParseError('Legacy .ppt format is not supported directly. Please convert it to .pptx or PDF and try again.');
  if (ext === 'pdf') {
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ParseError('That file is not a valid PDF.');
    try { const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default; text = (await pdfParse(buffer, { pagerender: renderPageWithNumber })).text || ''; }
    catch (err: any) { console.error('[upload] pdf parse failed:', err?.message); throw new ParseError('We could not read that PDF. It may be password-protected or damaged. Try saving it again or upload a TXT copy.'); }
  } else if (ext === 'docx') {
    try { const mammoth = await import('mammoth'); text = (await mammoth.extractRawText({ buffer })).value || ''; }
    catch (err: any) { console.error('[upload] docx parse failed:', err?.message); throw new ParseError('We could not read that Word document. Try saving it as PDF or TXT.'); }
  } else if (ext === 'pptx') {
    try { text = await extractTextFromPptx(buffer); }
    catch (err: any) { console.error('[upload] pptx parse failed:', err?.message); throw new ParseError('We could not read that PowerPoint presentation. Try saving it as PDF.'); }
  } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    try {
      text = await runAI({
        task: 'ocr_extraction',
        system: 'You are an accurate OCR assistant. Extract all readable text from the provided image accurately. Do not invent details. If there are diagrams, formulas, or bullet points, format them clearly using Markdown.',
        prompt: 'Transcribe all text and key study content visible in this image.',
        image: { base64: buffer.toString('base64'), mimeType: mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}` },
      });
    } catch (err: any) { console.error('[upload] image OCR failed:', err?.message); throw new ParseError('We could not extract text from that image. Please make sure it is clear or upload a document instead.'); }
  } else text = buffer.toString('utf-8');

  text = cleanText(text);
  if (!text) throw new ParseError('No readable text found in this file. If this is a scan or photo, try uploading a clearer image or text version.');
  return { content: text.slice(0, 12000), chunks: chunkText(text) };
}
