import type { PersonalNote } from './notes-offline';

function safeFilename(value: string) {
  return (value || 'akili-note').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'akili-note';
}

export function downloadNoteText(note: PersonalNote, format: 'txt' | 'md' = 'txt') {
  const heading = note.title || 'Personal Note';
  const body = `${heading}\n\n${note.content}\n\nUpdated: ${new Date(note.updated_at).toLocaleString()}`;
  const blob = new Blob([body], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(heading)}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function printNoteAsPdf(note: PersonalNote) {
  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (!printWindow) throw new Error('Your browser blocked the print window. Allow pop-ups for Akili and try again.');

  const title = escapeHtml(note.title || 'Personal Note');
  const content = escapeHtml(note.content).replace(/\n/g, '<br>');
  const updated = escapeHtml(new Date(note.updated_at).toLocaleString());

  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 24px;color:#16204A;line-height:1.7}
    h1{font-size:26px;margin-bottom:8px} .meta{font-size:12px;color:#5B6480;margin-bottom:28px} .content{font-size:16px;white-space:normal}
    @media print{body{margin:20mm auto} @page{size:A4;margin:16mm}}
  </style></head><body><h1>${title}</h1><div class="meta">Updated ${updated}</div><div class="content">${content}</div><script>window.onload=function(){window.print();}</script></body></html>`);
  printWindow.document.close();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}
