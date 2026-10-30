/**
 * Small, regex-free helpers for turning untrusted markup into plain text and for checking image data.
 * Regular expressions that strip tags can be bypassed with nested or broken markup (e.g. "<scr<script>ipt>"),
 * so these walk the text once, character by character, and repeat until nothing changes.
 */

/** Remove every `<...>` tag. Anything that still looks like a tag opener afterwards is dropped too. */
export function stripTags(input: string): string {
  let text = String(input ?? '');
  for (let pass = 0; pass < 5; pass++) {
    let out = ''; let inTag = false; let quote = '';
    for (const ch of text) {
      if (inTag) {
        if (quote) { if (ch === quote) quote = ''; }
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') inTag = false;
        continue;
      }
      if (ch === '<') { inTag = true; continue; }
      out += ch;
    }
    // An unfinished tag at the end ("<b") is dropped with the rest of that tag; no `<` can survive a pass.
    if (out === text) return out;
    text = out;
  }
  return text.split('<').join(' ').split('>').join(' ');
}

/** Drop whole `<name ...> ... </name>` blocks (script, style, ...) using plain string search. */
export function dropBlocks(html: string, names: string[]): string {
  let text = html;
  for (const name of names) {
    const open = `<${name}`; const close = `</${name}`;
    for (let guard = 0; guard < 10_000; guard++) {
      const lower = text.toLowerCase();
      const start = lower.indexOf(open);
      if (start < 0) break;
      const next = lower[start + open.length];
      if (next && /[a-z0-9]/.test(next)) { text = text.slice(0, start) + ' ' + text.slice(start + 1); continue; } // "<scripted>" is not a script tag
      const end = lower.indexOf(close, start);
      if (end < 0) { text = text.slice(0, start); break; }
      const gt = lower.indexOf('>', end);
      text = text.slice(0, start) + ' ' + (gt < 0 ? '' : text.slice(gt + 1));
    }
  }
  return text;
}

/** Remove `<!-- ... -->` comments (an unclosed one removes the rest, as browsers treat it). */
export function dropComments(html: string): string {
  let text = html;
  for (let guard = 0; guard < 10_000; guard++) {
    const start = text.indexOf('<!--'); if (start < 0) break;
    const end = text.indexOf('-->', start + 4);
    text = end < 0 ? text.slice(0, start) : text.slice(0, start) + ' ' + text.slice(end + 3);
  }
  return text;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** Decode the common entities in ONE pass, so "&amp;lt;" becomes "&lt;" and not "<". */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' '; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlTitle(html: string): string {
  const lower = html.toLowerCase(); const start = lower.indexOf('<title'); if (start < 0) return '';
  const gt = lower.indexOf('>', start); const end = lower.indexOf('</title', gt);
  return gt < 0 || end < 0 ? '' : decodeEntities(stripTags(html.slice(gt + 1, end))).replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** Page HTML to readable plain text. The result is data, never markup. */
export function htmlToText(html: string): string {
  const cleaned = dropBlocks(dropComments(html), ['script', 'style', 'noscript', 'template', 'svg']);
  // Decode entities AFTER the tags are gone, then strip once more so decoded "&lt;b&gt;" cannot become a tag.
  return stripTags(decodeEntities(stripTags(cleaned))).replace(/\s{2,}/g, ' ').trim();
}

/** Plain text from an untrusted model or user field. */
export const plainText = (s: unknown) => (typeof s === 'string' ? stripTags(s).trim() : '');

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const isSafeImageType = (t: unknown): t is string => typeof t === 'string' && IMAGE_TYPES.has(t.toLowerCase());
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** A `data:` URL for an image, or '' when the type or payload is not exactly what an image upload produces. */
export function safeImageSrc(img: { mimeType?: unknown; base64?: unknown } | null | undefined): string {
  if (!img || !isSafeImageType(img.mimeType) || typeof img.base64 !== 'string' || !img.base64 || !B64.test(img.base64)) return '';
  return `data:${img.mimeType.toLowerCase()};base64,${img.base64}`;
}
