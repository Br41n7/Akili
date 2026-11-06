/** Shared by the server's file reader and the browser's scanned-PDF reader: tidy text and split it into chunks. */
export function cleanText(text: string): string {
  return text
    .replace(/\(cid:\d+\)/gi, ' ')
    .replace(/[ﬁﬂﬃﬄ]/g, m => ({ ﬁ: 'fi', ﬂ: 'fl', ﬃ: 'ffi', ﬄ: 'ffl' }[m] || m))
    .replace(/[�﻿​-‍]/g, '')
    .replace(/\u0000/g, '')
    .replace(/(\b[a-zA-Z]+)-\s*\n\s*([a-zA-Z]+\b)/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chunkText(text: string): string[] {
  const chunks: string[] = []; let current = '';
  for (const para of text.split(/\n{2,}/)) {
    if ((current + para).length > 2000 && current) { chunks.push(current.trim()); current = para; } else current += '\n\n' + para;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
