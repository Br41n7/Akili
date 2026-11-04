/**
 * Repairs lesson text whose maths came back damaged from the model. Seen in the wild:
 *   - line breaks written as the two characters "\n" (the model escaped them twice),
 *   - display maths whose backslashes were lost, leaving "[\ce{A + B <=> C + D}]" or "[K_{eq} = \frac{[C]}{[A]}]"
 *     where "$$ ... $$" was meant.
 * Works on text that is already stored, so older lessons are fixed when they are shown. Text that is fine is left alone.
 */

// TeX commands that start with "n": a literal "\n" followed by one of these is maths, not a line break.
const TEX_N = new Set(['ne', 'neq', 'nu', 'nabla', 'neg', 'not', 'notin', 'ni', 'nearrow', 'nwarrow', 'nless', 'ngtr', 'nmid', 'nleq', 'ngeq', 'nsim', 'ncong', 'nparallel', 'nrightarrow', 'nleftarrow', 'nsubseteq', 'newline', 'nolimits', 'normalsize', 'natural']);

function fixLineBreaks(s: string): string {
  return s.replace(/\\n([a-z]*)/g, (m, word: string) => (word && TEX_N.has(('n' + word).match(/^n[a-z]*/)![0]) ? m : `\n${word}`));
}

/** Index of the "]" that closes the "[" at `open`, or -1. Nested brackets are counted. */
function closing(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length && i < open + 400; i++) {
    if (s[i] === '[') depth++;
    else if (s[i] === ']' && --depth === 0) return i;
    else if (s[i] === '\n' && s[i + 1] === '\n') return -1;
  }
  return -1;
}
const LOOKS_LIKE_MATH = /\\[a-zA-Z]+|[_^]|=|<=>|->/;

function fixBracketMaths(s: string): string {
  if (s.includes('$$')) return s; // already uses proper delimiters
  let out = ''; let i = 0;
  while (i < s.length) {
    const atLineStart = i === 0 || s[i - 1] === '\n';
    if (s[i] === '[' && atLineStart) {
      const end = closing(s, i);
      if (end > i) {
        const inner = s.slice(i + 1, end);
        // Only maths: it has TeX-like content and is not a Markdown link "[text](url)".
        if (inner.trim() && LOOKS_LIKE_MATH.test(inner) && s[end + 1] !== '(') {
          const tex = inner.trim().replace(/(?<=[A-Za-z0-9_}\]]),(?=\s*\[)/g, '\\,');
          out += `\n\n$$${tex}$$\n\n`; i = end + 1; if (/[.,;]/.test(s[i] || '')) i++; continue; // a full stop after display maths would sit alone on a line
        }
      }
    }
    out += s[i++];
  }
  return out;
}

export function normaliseMath(text: string): string {
  if (typeof text !== 'string' || !text) return '';
  let s = text;
  if (/\\n/.test(s) && !/\n/.test(s.slice(0, Math.min(s.length, 400)))) s = fixLineBreaks(s); // only when real line breaks are missing
  else if (/\\n(?![a-z])/.test(s)) s = fixLineBreaks(s);
  return fixBracketMaths(s).replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n');
}
