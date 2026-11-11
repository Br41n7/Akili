'use client';
import ErrorScreen from '@/components/ErrorScreen';
// Replaces the whole page, so it brings its own <html> and <body>.
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ margin: 0 }}><ErrorScreen {...props} /></body></html>;
}
