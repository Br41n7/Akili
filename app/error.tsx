'use client';
import ErrorScreen from '@/components/ErrorScreen';
export default function RouteError(props: { error: Error & { digest?: string }; reset: () => void }) { return <ErrorScreen {...props} />; }
