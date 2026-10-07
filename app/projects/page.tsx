'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { BookOpen, ChevronRight, ExternalLink, LogOut, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import NewProjectSheet from '@/components/NewProjectSheet';
import { Button, Chip, ConfirmDialog, EmptyState, ErrorState, IconButton, ListSkeleton, Surface, Wordmark } from '@/components/ui';
import { levelLabel, levelOf, projectChips, projectSubject, type ProjectRecord } from '@/lib/project-context';
import { formatDate } from '@/lib/utils';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showNew, setShowNew] = useState(false);
  const [toDelete, setToDelete] = useState<ProjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      const { data, error } = await supabase.from('projects').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      setProjects((data as ProjectRecord[]) || []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    if (!toDelete?.id) return;
    setDeleting(true);
    const { error } = await supabase.from('projects').delete().eq('id', toDelete.id);
    setDeleting(false);
    if (error) { toast.error('Could not delete the project. Try again.'); return; }
    setProjects(p => p.filter(x => x.id !== toDelete.id));
    setToDelete(null);
    toast.success('Project deleted');
  };

  const signOut = async () => { await supabase.auth.signOut(); router.push('/'); };

  return (
    <div className="min-h-dvh pb-28 sm:pb-12">
      <header className="pt-safe sticky top-0 z-40 border-b border-rule bg-chalk/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Wordmark />
          <div className="flex items-center gap-1">
            <Button className="hidden sm:inline-flex" size="sm" onClick={() => setShowNew(true)}><Plus size={16} /> New project</Button>
            <IconButton label="Sign out" onClick={signOut}><LogOut size={19} /></IconButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6">
        <div>
          <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">Your projects</h1>
          <p className="mt-1 text-sm text-muted">One project for each subject or course you are working on.</p>
        </div>

        {status === 'loading' && <ListSkeleton rows={3} />}

        {status === 'error' && <ErrorState title="Your projects did not load" message="Check your connection, then try again." onRetry={load} />}

        {status === 'ready' && projects.length === 0 && (
          <EmptyState
            icon={<BookOpen size={22} />}
            title="Start your first project"
            action={<Button onClick={() => setShowNew(true)}><Plus size={17} /> New project</Button>}
          >
            Pick your level, add your notes, and Akili builds lessons, quizzes and mock exams from them.
          </EmptyState>
        )}

        {status === 'ready' && projects.length > 0 && (
          <ul className="space-y-3">
            {projects.map(p => {
              const chips = projectChips(p);
              const subject = projectSubject(p);
              return (
                <li key={p.id}>
                  <Surface className="flex items-stretch overflow-hidden">
                    <Link href={`/projects/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-4 active:bg-chalk">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          <Chip tone={levelOf(p) === 'secondary' ? 'marker' : 'biro'}>{levelLabel(p)}</Chip>
                          {p.source === 'pastq' && <Chip tone="tick">PastQ</Chip>}
                        </div>
                        <h2 className="truncate text-lg font-bold leading-snug">{p.name}</h2>
                        <p className="mt-0.5 truncate text-sm text-muted">
                          {[subject && subject !== p.name ? subject : '', ...chips].filter(Boolean).join(' · ') || `Added ${p.created_at ? formatDate(p.created_at) : ''}`}
                        </p>
                      </div>
                      <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden="true" />
                    </Link>
                    <button
                      onClick={() => setToDelete(p)}
                      aria-label={`Delete ${p.name}`}
                      className="flex w-12 shrink-0 items-center justify-center border-l border-rule text-muted hover:text-redpen active:bg-redpen-wash"
                    >
                      <Trash2 size={17} />
                    </button>
                  </Surface>
                </li>
              );
            })}
          </ul>
        )}

        {status !== 'loading' && (
          <Surface className="flex flex-col gap-3 border-tick/30 bg-tick-wash p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-ink">Bought a question bank on PastQ?</p>
              <p className="text-sm text-ink/70">PastQ question banks are separate from your study materials. Open PastQ to choose a bank, then use its <strong>Import to Akili</strong> action.</p>
            </div>
            <a href={process.env.NEXT_PUBLIC_PASTQ_URL || 'https://pastq.co'} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-tick px-4 text-sm font-semibold text-white">
              <ExternalLink size={16} /> Open PastQ
            </a>
          </Surface>
        )}
      </main>

      {status === 'ready' && projects.length > 0 && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-chalk/95 p-3 backdrop-blur sm:hidden">
          <Button block onClick={() => setShowNew(true)}><Plus size={18} /> New project</Button>
        </div>
      )}

      <NewProjectSheet
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={p => { setShowNew(false); router.push(`/projects/${p.id}`); }}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this project?"
        body={<>“{toDelete?.name}” and everything in it, including materials, lessons and results, will be removed. This cannot be undone.</>}
        confirmLabel="Delete project"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
