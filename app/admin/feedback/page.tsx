import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AdminFeedback from '@/components/AdminFeedback';

export const metadata = { title: 'Feedback (admin)' };
/** A shell only. /api/admin/feedback checks the admin role on the server. */
export default function AdminFeedbackPage() {
  return (
    <div className="min-h-dvh pb-12">
      <header className="pt-safe sticky top-0 z-40 border-b border-rule bg-chalk/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-2">
          <Link href="/settings" aria-label="Back to settings" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-ink/5"><ArrowLeft size={20} /></Link>
          <h1 className="text-[17px] font-bold">Feedback</h1>
        </div>
      </header>
      <main className="mx-auto max-w-xl p-4"><AdminFeedback /></main>
    </div>
  );
}
