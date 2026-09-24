'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Upload, Plus, Trash2, FileText, StickyNote, X, Loader2, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Props { projectId: string; userId: string; }

export default function Materials({ projectId, userId }: Props) {
  const [tab, setTab] = useState<'docs' | 'notes'>('docs');
  const [docs, setDocs] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('documents').select('*').eq('project_id', projectId).eq('user_id', userId)
      .order('created_at', { ascending: false }).then(({ data }) => setDocs(data || []));
    supabase.from('notes').select('*').eq('project_id', projectId).eq('user_id', userId)
      .order('created_at', { ascending: false }).then(({ data }) => setNotes(data || []));
  }, [projectId, userId]);

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('project_id', projectId);

      const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Save to Supabase
      const { data: doc } = await supabase.from('documents').insert({
        project_id: projectId, user_id: userId,
        name: data.name || file.name,
        content: data.content,
        chunks: data.chunks,
        source_type: 'upload',
      }).select().single();

      if (doc) setDocs(p => [doc, ...p]);
      toast.success('Document uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const importFromUrl = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const res = await fetch('/api/documents/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim(), project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const { data: doc } = await supabase.from('documents').insert({
        project_id: projectId, user_id: userId,
        name: data.title, content: data.content,
        source_type: data.source_type,
      }).select().single();

      if (doc) setDocs(p => [doc, ...p]);
      setImportUrl('');
      toast.success('Page imported');
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const { data } = await supabase.from('notes').insert({
      project_id: projectId, user_id: userId, content: newNote.trim(),
    }).select().single();
    if (data) { setNotes(p => [data, ...p]); setNewNote(''); }
  };

  const deleteDoc = async (id: string) => {
    await supabase.from('documents').delete().eq('id', id);
    setDocs(p => p.filter(d => d.id !== id));
  };

  const deleteNote = async (id: string) => {
    await supabase.from('notes').delete().eq('id', id);
    setNotes(p => p.filter(n => n.id !== id));
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl w-fit">
        {(['docs', 'notes'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all',
              tab === t ? 'bg-white shadow-sm' : 'text-gray-500')}>
            {t === 'docs' ? `📄 Documents (${docs.length})` : `📝 Notes (${notes.length})`}
          </button>
        ))}
      </div>

      {tab === 'docs' && (
        <div className="space-y-3">
          {/* Upload */}
          <div className="bg-white rounded-3xl p-5 space-y-3">
            <input ref={fileRef} type="file" accept=".pdf,.txt" onChange={uploadFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full py-6 border-2 border-dashed border-gray-200 hover:border-indigo-400 rounded-2xl flex flex-col items-center gap-1.5 text-gray-400 hover:text-indigo-500 transition-all">
              {uploading ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
              <span className="text-sm font-medium">{uploading ? 'Processing...' : 'Upload PDF or TXT'}</span>
              <span className="text-xs">Max 15MB</span>
            </button>

            <div className="flex gap-2">
              <input value={importUrl} onChange={e => setImportUrl(e.target.value)}
                placeholder="Or paste Google Docs / webpage URL..."
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" />
              <button onClick={importFromUrl} disabled={!importUrl.trim() || importing}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-1.5">
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Import
              </button>
            </div>
          </div>

          {docs.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No documents yet — upload your first study material
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="bg-white rounded-2xl p-4 flex items-center gap-3 border border-black/5">
                  <FileText size={18} className={cn('shrink-0',
                    doc.source_type === 'pastq' ? 'text-green-500' :
                    doc.source_type === 'youtube' ? 'text-red-500' : 'text-indigo-500')} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{doc.name}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{doc.source_type} · {new Date(doc.created_at).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => deleteDoc(doc.id)} className="p-1.5 text-gray-300 hover:text-rose-500 transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="space-y-3">
          <div className="bg-white rounded-3xl p-4 flex gap-2">
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
              placeholder="Write a note..."
              rows={2}
              className="flex-1 text-sm resize-none focus:outline-none"
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) addNote(); }}
            />
            <button onClick={addNote} disabled={!newNote.trim()}
              className="self-end w-9 h-9 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center shrink-0">
              <Plus size={16} />
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">No notes yet</p>
          ) : (
            <div className="space-y-2">
              {notes.map(note => (
                <div key={note.id} className="bg-white rounded-2xl p-4 flex gap-3 border border-black/5">
                  <p className="flex-1 text-sm">{note.content}</p>
                  <button onClick={() => deleteNote(note.id)} className="shrink-0 p-1 text-gray-300 hover:text-rose-500">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
