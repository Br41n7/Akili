'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ErrorState, Skeleton, Surface } from '@/components/ui';
import PersonaPicker from '@/components/PersonaPicker';
import ReminderSettings from '@/components/ReminderSettings';
import PlanCard from '@/components/PlanCard';

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = async () => {
    setStatus('loading');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login?redirect=%2Fsettings'); return; }
      const { data, error } = await supabase.from('profiles').select('persona, role, reminders_enabled, reminder_hour').eq('id', user.id).maybeSingle();
      // The reminder columns arrive with migration 0009; settings still open without them.
      if (error) {
        const { data: basic, error: e2 } = await supabase.from('profiles').select('persona, role').eq('id', user.id).maybeSingle();
        if (e2) throw e2; setProfile(basic || {});
      } else setProfile(data || {});
      setStatus('ready');
    } catch { setStatus('error'); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-dvh pb-12">
      <header className="pt-safe sticky top-0 z-40 border-b border-rule bg-chalk/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-2">
          <Link href="/projects" aria-label="Back to projects" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-ink/5"><ArrowLeft size={20} /></Link>
          <h1 className="text-[17px] font-bold">Settings</h1>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 p-4">
        {status === 'loading' && <><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></>}
        {status === 'error' && <ErrorState message="Your settings did not load. Check your connection and try again." onRetry={load} />}
        {status === 'ready' && (
          <>
            <PlanCard />
            {profile?.role === 'admin' && <Link href="/admin/plans" className="block rounded-2xl border border-rule bg-paper p-4 text-sm font-bold">Admin: plans and prices</Link>}
            <Surface className="space-y-3 p-4">
              <div><h2 className="text-base font-bold">Tutor style</h2><p className="text-sm text-muted">How Akili talks to you in explanations, chat and feedback.</p></div>
              <PersonaPicker initial={profile?.persona} />
            </Surface>
            <Surface className="space-y-3 p-4">
              <h2 className="text-base font-bold">Study reminders</h2>
              <ReminderSettings enabled={!!profile?.reminders_enabled} hour={profile?.reminder_hour ?? 18} />
            </Surface>
          </>
        )}
      </main>
    </div>
  );
}
