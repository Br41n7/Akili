'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, EmptyState, ErrorState, ListSkeleton, Segmented, TextInput } from '@/components/ui';
import PastqBankCard from '@/components/PastqBankCard';
import { bankState, buyUrl, matchesBank, type LibraryBank } from '@/lib/pastq-library';

const PASTQ_URL = process.env.NEXT_PUBLIC_PASTQ_URL || 'https://pastq.co';
const BUY_TEMPLATE = process.env.NEXT_PUBLIC_PASTQ_BANK_URL;
const EXAMS = ['ALL', 'WAEC', 'JAMB', 'NECO', 'KCSE', 'OTHER'] as const;

/** Browse PastQ question banks without leaving Akili. Free banks import here; paid banks are bought on PastQ, then imported here. */
export default function PastqLibrary() {
  const router = useRouter();
  const [banks, setBanks] = useState<LibraryBank[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<Map<string, string>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [exam, setExam] = useState<(typeof EXAMS)[number]>('ALL');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setStatus('loading');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      const [b, p, pr] = await Promise.all([
        supabase.from('question_banks').select('id,title,subject,exam_type,year_start,year_end,school,country,question_count,price,status,description').eq('status', 'live').order('total_sales', { ascending: false }).limit(300),
        supabase.from('purchases').select('bank_id').eq('user_id', user.id).eq('paystack_status', 'success'),
        supabase.from('projects').select('id,source_bank_id').eq('user_id', user.id).not('source_bank_id', 'is', null),
      ]);
      if (b.error) throw b.error;
      setBanks((b.data as LibraryBank[]) || []);
      setOwned(new Set((p.data || []).map((x: any) => x.bank_id)));
      setImported(new Map((pr.data || []).map((x: any) => [x.source_bank_id as string, x.id as string])));
      setStatus('ready');
    } catch { if (!quiet) setStatus('error'); }
  }, [router]);

  useEffect(() => { load(); }, [load]);
  // Coming back from PastQ after paying: look again, so "Buy" turns into "Import" without a manual refresh.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(true); };
    document.addEventListener('visibilitychange', onVisible); return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const shown = useMemo(() => banks.filter(b => matchesBank(b, query, exam)), [banks, query, exam]);
  const importedIds = useMemo(() => new Set(imported.keys()), [imported]);

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-chalk pb-16">
      <header className="sticky top-0 z-30 border-b border-rule bg-chalk/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/projects" aria-label="Back to projects" className="grid h-10 w-10 place-items-center"><ArrowLeft size={20} /></Link>
          <div className="min-w-0 flex-1"><h1 className="text-lg font-extrabold leading-tight">Past questions</h1><p className="truncate text-xs text-muted">From PastQ. Free banks import here. Paid ones you buy on PastQ.</p></div>
          <button onClick={() => load()} aria-label="Refresh" className="grid h-10 w-10 place-items-center"><RefreshCw size={18} /></button>
        </div>
      </header>
      <main className="space-y-4 p-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <TextInput aria-label="Search question banks" className="pl-9" placeholder="Search subject, exam or school" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <Segmented<(typeof EXAMS)[number]> label="Exam" value={exam} onChange={setExam} options={EXAMS.map(e => ({ value: e, label: e === 'ALL' ? 'All' : e }))} />
        {status === 'loading' && <ListSkeleton rows={4} />}
        {status === 'error' && <ErrorState message="The question banks did not load. Check your connection and try again." onRetry={() => load()} />}
        {status === 'ready' && (shown.length === 0 ? (
          <EmptyState title={banks.length ? 'No banks match' : 'No question banks yet'}>{banks.length ? 'Try a different word or exam.' : 'Nothing is listed on PastQ yet. Check back soon.'}</EmptyState>
        ) : (
          <ul className="space-y-3">{shown.map(b => (
            <li key={b.id}><PastqBankCard bank={b} state={bankState(b, owned, importedIds)} buyHref={buyUrl(BUY_TEMPLATE, PASTQ_URL, b.id)} projectId={imported.get(b.id)} /></li>
          ))}</ul>
        ))}
        <p className="text-center text-xs text-muted">Bought a bank somewhere else? <a className="underline" href={PASTQ_URL} target="_blank" rel="noopener noreferrer">Open PastQ</a>. Purchases show up here after payment.</p>
      </main>
    </div>
  );
}
