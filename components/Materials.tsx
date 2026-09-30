'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Link2, Plus, StickyNote, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage } from '@/lib/utils';
import { ACCEPTED_TYPES, uploadDocument } from '@/lib/upload-document';
import { Button, ConfirmDialog, EmptyState, ErrorState, ListSkeleton, Segmented, Surface, TextArea, TextInput, IconButton } from '@/components/ui';

interface Props { projectId: string; userId: string }
type Tab = 'docs' | 'notes';

export default function Materials({ projectId, userId }: Props) {
  const [tab, setTab] = useState<Tab>('docs');
  const [docs, setDocs] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [newNote, setNewNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'doc' | 'note'; id: string; label: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setStatus('loading');
    Promise.all([
      supabase.from('documents').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('notes').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false }),
    ]).then(([d, n]) => {
      if (d.error || n.error) { setStatus('error'); return; }
      setDocs(d.data || []); setNotes(n.data || []); setStatus('ready');
    });
  };

  useEffect(load, [projectId, userId]);

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = '';
    if (files.length === 0) return;
    setUploading(true);
    let added = 0;
    for (const file of files) {
      try {
        const doc = await uploadDocument(file, projectId, userId);
        setDocs(p => [doc, ...p]);
        added++;
      } catch (err) {
        toast.error(errorMessage(err, `${file.name} could not be uploaded.`));
      }
    }
    if (added > 0) toast.success(added === 1 ? 'Document uploaded' : `${added} documents uploaded`);
    setUploading(false);
  };

  const importFromUrl = async () => {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const res = await fetch('/api/documents/import-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, project_id: projectId }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || 'That page could not be imported.');

      const { data: doc, error } = await supabase.from('documents')
        .insert({ project_id: projectId, user_id: userId, name: data.title, content: data.content, source_type: data.source_type })
        .select().single();
      if (error || !doc) throw new Error('The page was read but could not be saved. Please try again.');

      setDocs(p => [doc, ...p]);
      setImportUrl('');
      toast.success('Page imported');
    } catch (err) {
      toast.error(errorMessage(err, 'Import failed. Please try again.'));
    } finally {
      setImporting(false);
    }
  };

  const addNote = async () => {
    const content = newNote.trim();
    if (!content) return;
    const { data, error } = await supabase.from('notes').insert({ project_id: projectId, user_id: userId, content }).select().single();
    if (error || !data) { toast.error('Could not save the note.'); return; }
    setNotes(p => [data, ...p]);
    setNewNote('');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const table = deleteTarget.kind === 'doc' ? 'documents' : 'notes';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Could not delete that. Try again.'); return; }
    if (deleteTarget.kind === 'doc') setDocs(p => p.filter(d => d.id !== deleteTarget.id));
    else setNotes(p => p.filter(n => n.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <Segmented<Tab>
        label="Materials view"
        value={tab}
        onChange={setTab}
        options={[{ value: 'docs', label: `Documents (${docs.length})` }, { value: 'notes', label: `Notes (${notes.length})` }]}
      />

      {status === 'error' && <ErrorState message="Your materials did not load. Check your connection and try again." onRetry={load} />}

      {tab === 'docs' && status !== 'error' && (
        <div className="space-y-3">
          <Surface className="space-y-3 p-4">
            <input ref={fileRef} type="file" multiple accept={ACCEPTED_TYPES} onChange={uploadFile} className="sr-only" aria-label="Choose PDF or TXT files" />
            <Button variant="quiet" block loading={uploading} onClick={() => fileRef.current?.click()} className="min-h-24 flex-col gap-1.5 border-2 border-dashed">
              <Upload size={22} />
              <span>{uploading ? 'Processing…' : 'Upload PDF or TXT files'}</span>
              <span className="text-xs font-normal text-muted">Max 2MB per file</span>
            </Button>
            <div className="flex gap-2">
              <TextInput value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="Paste a Google Docs or webpage link" onKeyDown={e => e.key === 'Enter' && importFromUrl()} />
              <Button loading={importing} disabled={!importUrl.trim()} onClick={importFromUrl}><Link2 size={16} /> Import</Button>
            </div>
          </Surface>

          {status === 'loading' && <ListSkeleton rows={2} />}
          {status === 'ready' && docs.length === 0 && <EmptyState icon={<FileText size={22} />} title="No documents yet">Upload your notes or import a page to get started.</EmptyState>}
          {status === 'ready' && docs.length > 0 && (
            <ul className="space-y-2">
              {docs.map(doc => (
                <li key={doc.id}>
                  <Surface className="flex items-center gap-3 p-3.5">
                    <FileText size={18} className="shrink-0 text-biro" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{doc.name}</p>
                      <p className="text-xs capitalize text-muted">{doc.source_type} · {new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                    <IconButton label={`Delete ${doc.name}`} onClick={() => setDeleteTarget({ kind: 'doc', id: doc.id, label: doc.name })}><Trash2 size={16} /></IconButton>
                  </Surface>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'notes' && status !== 'error' && (
        <div className="space-y-3">
          <Surface className="flex items-end gap-2 p-3">
            <TextArea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Write a note" rows={2} className="border-0 px-1 focus:ring-0" onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) addNote(); }} />
            <IconButton label="Add note" onClick={addNote} disabled={!newNote.trim()} className="mb-1 shrink-0 bg-biro text-white hover:bg-biro-dark disabled:opacity-40"><Plus size={17} /></IconButton>
          </Surface>

          {status === 'loading' && <ListSkeleton rows={2} />}
          {status === 'ready' && notes.length === 0 && <EmptyState icon={<StickyNote size={22} />} title="No notes yet">Jot down anything worth remembering.</EmptyState>}
          {status === 'ready' && notes.length > 0 && (
            <ul className="space-y-2">
              {notes.map(note => (
                <li key={note.id}>
                  <Surface className="flex gap-3 p-3.5">
                    <p className="flex-1 font-read text-[15px] leading-relaxed">{note.content}</p>
                    <IconButton label="Delete note" onClick={() => setDeleteTarget({ kind: 'note', id: note.id, label: 'this note' })} className="h-9 w-9 shrink-0"><X size={15} /></IconButton>
                  </Surface>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?.kind === 'doc' ? `Delete "${deleteTarget.label}"?` : 'Delete this note?'}
        body="This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
