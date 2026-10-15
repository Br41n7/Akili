'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StickyNote, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props { projectId: string; userId: string }

export default function QuickNoteModal({ projectId, userId }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const body = content.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const noteTitle = title.trim() || 'Quick note';
      let { error } = await supabase.from('notes').insert({
        project_id: projectId, user_id: userId, title: noteTitle, content: body,
      });
      // Older production schemas may not have the optional title column yet.
      // Preserve the note rather than losing it; the migration adds the title column.
      if (error && /title|column|schema cache/i.test(error.message)) {
        const fallback = await supabase.from('notes').insert({
          project_id: projectId, user_id: userId, content: `# ${noteTitle}\n\n${body}`,
        });
        error = fallback.error;
      }
      if (error) throw error;
      toast.success('Note saved to Materials');
      setTitle('');
      setContent('');
      setOpen(false);
    } catch {
      toast.error('Could not save this note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Take a quick note"
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-white shadow-lg transition hover:opacity-90 md:bottom-6">
      <StickyNote size={17} /> <span>Quick note</span>
    </button>
    {open && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
      onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="quick-note-title"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl bg-paper p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div><h2 id="quick-note-title" className="text-lg font-bold">Quick note</h2>
            <p className="text-sm text-muted">Capture something you learned. It will be saved in Materials → Notes.</p></div>
          <button type="button" aria-label="Close quick note" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-ink/5"><X size={19}/></button>
        </div>
        <label className="mb-1 block text-sm font-semibold" htmlFor="quick-note-name">Title (optional)</label>
        <input id="quick-note-name" value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
          placeholder="e.g. Protein structure — key points" className="mb-3 w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-sm outline-none focus:border-ink"/>
        <label className="mb-1 block text-sm font-semibold" htmlFor="quick-note-content">Note</label>
        <textarea id="quick-note-content" value={content} onChange={e => setContent(e.target.value)} rows={6}
          placeholder="Write the important point in your own words…" autoFocus
          className="w-full resize-y rounded-xl border border-rule bg-white px-3 py-3 text-sm outline-none focus:border-ink"/>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-ink/5">Cancel</button>
          <button type="button" disabled={!content.trim() || saving} onClick={save}
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save note'}</button>
        </div>
      </section>
    </div>}
  </>;
}
