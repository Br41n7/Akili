/**
 * Makes pipe tables from the model render as real tables. Seen in practice: a separator row with a different number of columns
 * than the header (the whole table then shows as plain text), no blank line before the table, rows with too few or too many cells,
 * "<br>" inside a cell, and a "|" inside a formula such as $$|x|$$ that splits the cell in two.
 * Text that is already a clean table, and everything that is not a table, is left as it is. Code blocks are never touched.
 */
const SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const hasPipe = (l: string) => l.includes('|');

/** Replace "|" inside $$...$$ so it is not taken for a cell border. */
function protectMath(line: string): string {
  return line.replace(/\$\$([^$]*)\$\$/g, (_m, inner: string) => `$$${inner.replace(/\\?\|/g, '\\vert ')}$$`);
}
function splitRow(line: string): string[] {
  let s = protectMath(line).trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur);
  return cells.map(c => c.replace(/<br\s*\/?>/gi, '; ').replace(/\s+/g, ' ').trim());
}
const align = (cell: string) => { const c = cell.trim(); return c.startsWith(':') && c.endsWith(':') && c.length > 1 ? ':---:' : c.endsWith(':') ? '---:' : c.startsWith(':') ? ':---' : '---'; };
const row = (cells: string[]) => `| ${cells.join(' | ')} |`;

export function normaliseTables(md: string): string {
  if (!md || !md.includes('|')) return md;
  const lines = md.split('\n'); const out: string[] = []; let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; out.push(line); continue; }
    if (fence || !hasPipe(line) || !(i + 1 < lines.length) || !hasPipe(lines[i + 1]) || !SEP.test(lines[i + 1]) || SEP.test(line)) { out.push(line); continue; }
    // line i is a header, line i+1 is the separator row: rebuild the whole table
    const head = splitRow(line); const n = head.length; const seps = splitRow(lines[i + 1]);
    if (n < 2) { out.push(line); continue; }
    let j = i + 2; const body: string[][] = [];
    while (j < lines.length && lines[j].trim() !== '' && hasPipe(lines[j]) && !/^\s*(```|~~~)/.test(lines[j])) {
      let cells = splitRow(lines[j]);
      if (cells.length > n) cells = [...cells.slice(0, n - 1), cells.slice(n - 1).join(' / ')];
      while (cells.length < n) cells.push('');
      body.push(cells); j++;
    }
    if (out.length && out[out.length - 1].trim() !== '') out.push(''); // a table needs a blank line before it
    out.push(row(head), row(Array.from({ length: n }, (_, k) => align(seps[k] ?? '---'))), ...body.map(row));
    if (j < lines.length && lines[j].trim() !== '') out.push('');
    i = j - 1;
  }
  return out.join('\n');
}
