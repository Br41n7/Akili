'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Download, FileText, Link2, Pencil, Plus, RefreshCw, Search, StickyNote, Trash2,
  Upload, Wifi, WifiOff, X, Youtube,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage } from '@/lib/utils';
import { ACCEPTED_TYPES, uploadDocument } from '@/lib/upload-document';
import {
  clearDeletedNoteIds, markNoteDeleted, mergeNotes, newLocalNote, readDeletedNoteIds, readOfflineNotes, writeOfflineNotes,
  type NoteSyncState,
} from '@/lib/notes-offline';
import { downloadNoteText, printNoteAsPdf } from '@/lib/note-export';
import {
  Button, ConfirmDialog, EmptyState, ErrorState, ListSkeleton, Segmented,
  Surface, TextArea, TextInput, IconButton,
} from '@/components/ui';

interface Props { projectId: string; userId: string }
type Tab = 'docs' | 'notes';

type NoteEditor = { id?: string; title: string; content: string };

function urlKind(value: string): 'youtube' | 'google' | 'web' | 'empty' {
  const valueTrimmed = value.trim();
  if (!valueTrimmed) return 'empty';
  try {
    const url = new URL(valueTrimmed);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') return 'youtube';
    if (host === 'docs.google.com') return 'google';
  } catch { /* handled by the import endpoint */ }
  return 'web';
}

export default function Materials({ projectId, userId }: Props) {
  const [tab, setTab] = useState<Tab>('docs');
  const [docs, setDocs] = useState<any[]>([]);
  const [notes, setNotes] = useState<NoteSyncState[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [noteEditor, setNoteEditor] = useState<NoteEditor | null>(null);
  const [noteSearch, setNoteSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'doc' | 'note'; id: string; label: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const syncNotes = useCallback(async (currentNotes?: NoteSyncState[]) => {
    if (!navigator.onLine) return currentNotes || notes;
    setSyncing(true);
    try {
      const local = currentNotes || notes;
      const deletedIds = readDeletedNoteIds(userId, projectId);
      for (const id of deletedIds) {
        const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', userId);
        if (error) throw error;
      }
      const pending = local.filter(n => n.sync_state === 'pending' && !deletedIds.includes(n.id));
      for (const note of pending) {
        const { error } = await supabase.from('notes').upsert({
          id: note.id,
          project_id: note.project_id,
          user_id: note.user_id,
          title: note.title,
          content: note.content,
          created_at: note.created_at,
          updated_at: note.updated_at,
        }, { onConflict: 'id' });
        if (error) throw error;
      }

      const { data, error } = await supabase
        .from('notes')
        .select('id, project_id, user_id, title, content, created_at, updated_at')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const merged = mergeNotes(data || [], readOfflineNotes(userId, projectId));
      const clean = merged.filter(n => !deletedIds.includes(n.id)).map(n => ({ ...n, sync_state: 'synced' as const }));
      setNotes(clean);
      writeOfflineNotes(userId, projectId, clean);
      clearDeletedNoteIds(userId, projectId, deletedIds);
      return clean;
    } catch (err) {
      console.warn('[notes] sync failed:', err);
      const local = currentNotes || notes;
      writeOfflineNotes(userId, projectId, local);
      return local;
    } finally {
      setSyncing(false);
    }
  }, [notes, projectId, userId]);

  const load = useCallback(async () => {
    setStatus('loading');
    const cachedNotes = readOfflineNotes(userId, projectId);
    if (cachedNotes.length) setNotes(cachedNotes);
    setOnline(navigator.onLine);

    try {
      const docsQuery = supabase.from('documents').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false });
      const notesQuery = navigator.onLine
        ? supabase.from('notes').select('id, project_id, user_id, title, content, created_at, updated_at').eq('project_id', projectId).eq('user_id', userId).order('updated_at', { ascending: false })
        : Promise.resolve({ data: null, error: null } as any);
      const [d, n] = await Promise.all([docsQuery, notesQuery]);
      if (d.error) throw d.error;

      setDocs(d.data || []);
      if (n.data) {
        const merged = mergeNotes(n.data, cachedNotes);
        setNotes(merged);
        writeOfflineNotes(userId, projectId, merged);
      }
      setStatus('ready');
    } catch (err) {
      console.warn('[materials] load failed:', err);
      if (cachedNotes.length) setStatus('ready');
      else setStatus('error');
    }
  }, [projectId, userId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onlineHandler = () => {
      setOnline(true);
      toast.success('Back online — syncing your notes');
      void syncNotes();
    };
    const offlineHandler = () => {
      setOnline(false);
      toast('You are offline. New notes will be saved on this device.', { icon: '📴' });
    };
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }, [syncNotes]);

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
      const res = await fetch('/api/documents/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, project_id: projectId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || 'That source could not be imported.');

      const { data: doc, error } = await supabase.from('documents').insert({
        project_id: projectId,
        user_id: userId,
        name: data.title,
        content: data.content,
        source_type: data.source_type,
      }).select().single();
      if (error || !doc) throw new Error('The material was read but could not be saved. Please try again.');

      setDocs(p => [doc, ...p]);
      setImportUrl('');
      toast.success(data.source_type === 'youtube' ? 'YouTube lesson imported' : 'Learning material imported');
    } catch (err) {
      toast.error(errorMessage(err, 'Import failed. Please check the link and try again.'));
    } finally {
      setImporting(false);
    }
  };

  const saveNote = async () => {
    if (!noteEditor) return;
    const title = noteEditor.title.trim() || 'Untitled note';
    const content = noteEditor.content.trim();
    if (!content) return;

    const now = new Date().toISOString();
    const existing = noteEditor.id ? notes.find(n => n.id === noteEditor.id) : null;
    const next: NoteSyncState = existing
      ? { ...existing, title, content, updated_at: now, sync_state: 'pending' }
      : newLocalNote(userId, projectId, title, content);

    const nextNotes = [next, ...notes.filter(n => n.id !== next.id)].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    setNotes(nextNotes);
    writeOfflineNotes(userId, projectId, nextNotes);
    setNoteEditor(null);

    if (!navigator.onLine) {
      toast.success('Saved offline');
      return;
    }

    const synced = await syncNotes(nextNotes);
    const saved = synced.find(n => n.id === next.id);
    if (saved?.sync_state === 'synced') toast.success(existing ? 'Note updated' : 'Note saved');
    else toast('Saved on this device; it will sync when you are back online.', { icon: '📴' });
  };

  const deleteNote = async (id: string) => {
    const next = notes.filter(n => n.id !== id);
    setNotes(next);
    writeOfflineNotes(userId, projectId, next);
    setDeleteTarget(null);
    if (!navigator.onLine) {
      markNoteDeleted(userId, projectId, id);
      toast.success('Note deleted offline; it will sync when you are back online.');
      return;
    }
    const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', userId);
    if (error) {
      toast.error('Could not delete the note from the server. It will remain locally until you are online again.');
      const deleted = notes.find(n => n.id === id);
      if (deleted) {
        const restored = [...next, { ...deleted, sync_state: 'pending' as const }];
        setNotes(restored);
        writeOfflineNotes(userId, projectId, restored);
      }
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'note') {
      await deleteNote(deleteTarget.id);
      return;
    }
    const { error } = await supabase.from('documents').delete().eq('id', deleteTarget.id).eq('user_id', userId);
    if (error) { toast.error('Could not delete that. Try again.'); return; }
    setDocs(p => p.filter(d => d.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const filteredNotes = notes.filter(note => `${note.title} ${note.content}`.toLowerCase().includes(noteSearch.trim().toLowerCase()));
  const source = urlKind(importUrl);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <Segmented<Tab>
        label="Materials view"
        value={tab}
        onChange={setTab}
        options={[{ value: 'docs', label: `Learning material (${docs.length})` }, { value: 'notes', label: `My notes (${notes.length})` }]}
      />

      {status === 'error' && <ErrorState message="Your materials did not load. Check your connection, then try again." onRetry={load} />}

      {tab === 'docs' && status !== 'error' && (
        <div className="space-y-3">
          <Surface className="space-y-4 p-4">
            <div>
              <h2 className="font-bold">Add learning material</h2>
              <p className="mt-1 text-sm text-muted">Upload your study files or paste a link. Past questions are a separate study path.</p>
            </div>

            <input ref={fileRef} type="file" multiple accept={ACCEPTED_TYPES} onChange={uploadFile} className="sr-only" aria-label="Choose a supported learning material file" />
            <Button variant="quiet" block loading={uploading} onClick={() => fileRef.current?.click()} className="min-h-24 flex-col gap-1.5 border-2 border-dashed">
              <Upload size={22} />
              <span>{uploading ? 'Processing…' : 'Choose files from your device'}</span>
              <span className="text-xs font-normal text-muted">PDF, DOCX, PPTX, TXT or images · max 10MB</span>
            </Button>
            <p className="text-xs text-muted">If your phone does not open a file picker, open its Files/File Manager app and make sure it is enabled, then try again.</p>

            <div className="border-t border-rule pt-4">
              <label htmlFor="material-url" className="text-sm font-semibold">Paste a learning link</label>
              <div className="mt-1.5 flex gap-2">
                <TextInput id="material-url" value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="Google Docs, Google Slides, YouTube, or webpage" onKeyDown={e => e.key === 'Enter' && importFromUrl()} />
                <Button loading={importing} disabled={!importUrl.trim()} onClick={importFromUrl}>
                  {source === 'youtube' ? <Youtube size={16} /> : <Link2 size={16} />} Import
                </Button>
              </div>
              {source === 'youtube' && <p className="mt-1.5 text-xs text-muted">YouTube imports use the video's available transcript. Videos without usable transcripts may not import.</p>}
              {source === 'google' && <p className="mt-1.5 text-xs text-muted">Google Docs/Slides must be accessible to anyone with the link.</p>}
            </div>
          </Surface>

          <Surface className="flex items-start gap-3 p-4 bg-marker/20 border-marker/40">
            <StickyNote size={19} className="mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold">Past questions are different</p>
              <p className="mt-0.5 text-muted">Use <strong>Past Questions</strong> when you want examination question banks. Don't use material import for PastQ banks.</p>
            </div>
          </Surface>

          {status === 'loading' && <ListSkeleton rows={2} />}
          {status === 'ready' && docs.length === 0 && <EmptyState icon={<FileText size={22} />} title="No learning material yet">Upload your notes, slides, documents, or import a supported learning link to get started.</EmptyState>}
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
          <Surface className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">My personal notes</h2>
                <p className="text-xs text-muted">Jot down points you want to remember. Notes are private to your account.</p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? 'Online' : 'Offline'}</span>
            </div>
            <Button block onClick={() => setNoteEditor({ title: '', content: '' })}><Plus size={16} /> New note</Button>
            <div className="flex gap-2">
              <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><TextInput value={noteSearch} onChange={e => setNoteSearch(e.target.value)} placeholder="Search your notes" className="pl-9" /></div>
              <Button variant="quiet" size="sm" onClick={() => void syncNotes()} loading={syncing} aria-label="Sync notes"><RefreshCw size={16} /></Button>
            </div>
            {!online && <p className="text-xs text-muted">Notes you create or edit now are saved on this device and will sync when the connection returns.</p>}
          </Surface>

          {status === 'loading' && <ListSkeleton rows={2} />}
          {status === 'ready' && filteredNotes.length === 0 && <EmptyState icon={<StickyNote size={22} />} title={noteSearch ? 'No matching notes' : 'No notes yet'}>{noteSearch ? 'Try another search.' : 'Jot down anything worth remembering.'}</EmptyState>}
          {status === 'ready' && filteredNotes.length > 0 && (
            <ul className="space-y-2">
              {filteredNotes.map(note => (
                <li key={note.id}>
                  <Surface className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold">{note.title || 'Untitled note'}</h3>
                        <p className="mt-1 whitespace-pre-wrap font-read text-[15px] leading-relaxed">{note.content}</p>
                        <p className="mt-3 flex items-center gap-2 text-[11px] text-muted">
                          {note.sync_state === 'pending' ? <><WifiOff size={12} /> Saved on this device</> : <>Updated {new Date(note.updated_at).toLocaleString()}</>}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <IconButton label="Edit note" onClick={() => setNoteEditor({ id: note.id, title: note.title, content: note.content })}><Pencil size={16} /></IconButton>
                        <IconButton label="Export note" onClick={() => downloadNoteText(note, 'md')}><Download size={16} /></IconButton>
                        <IconButton label="Delete note" onClick={() => setDeleteTarget({ kind: 'note', id: note.id, label: note.title || 'this note' })}><X size={15} /></IconButton>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-rule pt-3">
                      <Button variant="quiet" size="sm" onClick={() => downloadNoteText(note, 'txt')}>Export TXT</Button>
                      <Button variant="quiet" size="sm" onClick={() => downloadNoteText(note, 'md')}>Export Markdown</Button>
                      <Button variant="quiet" size="sm" onClick={() => { try { printNoteAsPdf(note); } catch (err) { toast.error(errorMessage(err, 'Could not open the PDF print view.')); } }}>Export PDF</Button>
                    </div>
                  </Surface>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {noteEditor && (
        <div className="fixed inset-0 z-[70] flex items-end bg-ink/50 p-0 sm:items-center sm:p-4" onClick={() => setNoteEditor(null)}>
          <div role="dialog" aria-modal="true" aria-label={noteEditor.id ? 'Edit note' : 'New note'} onClick={e => e.stopPropagation()} className="w-full rounded-t-3xl bg-paper p-4 pb-safe sm:mx-auto sm:max-w-lg sm:rounded-3xl sm:pb-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{noteEditor.id ? 'Edit note' : 'New personal note'}</h2><IconButton label="Close" onClick={() => setNoteEditor(null)}><X size={20} /></IconButton></div>
            <div className="space-y-3">
              <TextInput value={noteEditor.title} onChange={e => setNoteEditor(v => v && ({ ...v, title: e.target.value }))} placeholder="Note title" autoFocus />
              <TextArea value={noteEditor.content} onChange={e => setNoteEditor(v => v && ({ ...v, content: e.target.value }))} placeholder="Write what you want to remember…" rows={9} />
              <div className="flex gap-2"><Button variant="quiet" block onClick={() => setNoteEditor(null)}>Cancel</Button><Button block onClick={saveNote} disabled={!noteEditor.content.trim()}>Save note</Button></div>
            </div>
          </div>
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
