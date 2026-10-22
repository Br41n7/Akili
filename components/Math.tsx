import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Renders bare TeX with KaTeX. Never throws: bad TeX shows as plain text.
 * KaTeX output is safe to inject with `trust: false` (no raw HTML, links or commands that load URLs).
 */
export function renderTeX(tex: string, block = false): string {
  return katex.renderToString(tex, { displayMode: block, throwOnError: false, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 500, output: 'htmlAndMathml' });
}

export default function TeX({ tex, block = false, className }: { tex: string; block?: boolean; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: renderTeX(tex, block) }} />;
}
