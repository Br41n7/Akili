'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText, Link2, Paperclip, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { createProjectSchema, type EducationLevel, type ProjectRecord } from '@/lib/project-context';
import { ACCEPTED_TYPES, checkFile, formatSize, uploadDocument } from '@/lib/upload-document';
import { Button, ChoiceChips, Field, IconButton, TextInput } from '@/components/ui';
import { errorMessage } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (project: ProjectRecord) => void;
}

const MAX_FILES_AT_CREATION = 5;
const LEVELS: { value: EducationLevel; label: string }[] = [
  { value: 'university', label: 'University' },
  { value: 'secondary', label: 'Secondary / O-Level' },
];

export default function NewProjectSheet({ open, onClose, onCreated }: Props) {
  const [level, setLevel] = useState<EducationLevel>('university');
  const [name, setName] = useState('');
  const [course, setCourse] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [nameError, setNameError] = useState('');
  const [serverError, setServerError] = useState('');
  const [progress, setProgress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLevel('university'); setName(''); setCourse(''); setImportUrl(''); setFiles([]);
    setFileError(''); setNameError(''); setServerError(''); setProgress('');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = '';
    const problems: string[] = [];
    const next = [...files];
    for (const f of picked) {
      const problem = checkFile(f);
      if (problem) { problems.push(problem); continue; }
      if (next.some(x => x.name === f.name && x.size === f.size)) continue;
      if (next.length >= MAX_FILES_AT_CREATION) { problems.push(`You can add up to ${MAX_FILES_AT_CREATION} files now. Add the rest after creating the project.`); break; }
      next.push(f);
    }
    setFiles(next);
    setFileError(problems.join(' '));
  };

  const removeFile = (index: number) => { setFiles(f => f.filter((_, i) => i !== index)); setFileError(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    const payload = { education_level: level, name, subject: course };
    const check = createProjectSchema.safeParse(payload);
    if (!check.success) { setNameError(check.error.issues[0]?.message || 'Give your project a name'); return; }

    setSubmitting(true);
    let project: ProjectRecord | null = null;
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(check.data) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.project) throw new Error(data?.error || 'We could not create the project. Please try again.');
      project = data.project as ProjectRecord;
    } catch (err) {
      setServerError(errorMessage(err, 'We could not create the project. Check your connection and try again.'));
      setSubmitting(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const failed: string[] = [];

    // Optional URL import during project creation
    if (importUrl.trim() && project.id && user) {
      setProgress('Importing link…');
      try {
        const res = await fetch('/api/documents/import-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: importUrl.trim(), project_id: project.id })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) throw new Error(data?.error || 'Could not import provided URL.');
        await supabase.from('documents').insert({
          project_id: project.id,
          user_id: user.id,
          name: data.title,
          content: data.content,
          source_type: data.source_type
        });
      } catch (err) {
        failed.push(`URL Import: ${errorMessage(err, 'Import failed')}`);
      }
    }

    // Upload files
    if (files.length > 0 && project.id) {
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading ${i + 1} of ${files.length}…`);
        try {
          if (!user) throw new Error('Please sign in again.');
          await uploadDocument(files[i], project.id, user.id);
        } catch (err) {
          failed.push(`${files[i].name}: ${errorMessage(err, 'upload failed')}`);
        }
      }
    }

    if (failed.length > 0) {
      toast.error(`Project created with warnings: ${failed.join('; ')}`, { duration: 7000 });
    }
    setSubmitting(false);
    onCreated(project);
  };

  const totalItems = files.length + (importUrl.trim() ? 1 : 0);
  const submitLabel = totalItems > 0 ? `Create project and add ${totalItems} material${totalItems === 1 ? '' : 's'}` : 'Create project';

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 animate-fade sm:items-center" onClick={() => !submitting && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onClick={e => e.stopPropagation()}
        className="flex max-h-[94dvh] w-full max-w-lg animate-sheet flex-col rounded-t-3xl bg-chalk sm:max-h-[88dvh] sm:rounded-3xl"
      >
        <header className="flex items-center gap-1 border-b border-rule py-2 pl-5 pr-2">
          <h2 id="new-project-title" className="flex-1 text-lg font-bold">New project</h2>
          <IconButton label="Close" onClick={onClose} disabled={submitting}><X size={20} /></IconButton>
        </header>

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <p id="np-level-label" className="text-sm font-semibold">Level</p>
              <ChoiceChips label="Level" options={LEVELS} value={level} onChange={setLevel} />
            </div>

            <Field label="Project name" htmlFor="np-name" error={nameError}>
              <TextInput
                id="np-name"
                value={name}
                onChange={e => { setName(e.target.value); setNameError(''); }}
                placeholder={level === 'secondary' ? 'WAEC Biology revision' : 'Anatomy semester notes'}
                maxLength={80}
                autoFocus
                aria-invalid={!!nameError}
              />
            </Field>

            <Field label={level === 'secondary' ? 'Subject' : 'Course'} htmlFor="np-course" optional>
              <TextInput
                id="np-course"
                value={course}
                onChange={e => setCourse(e.target.value)}
                placeholder={level === 'secondary' ? 'Biology' : 'Human Anatomy'}
                maxLength={80}
              />
            </Field>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold">Study materials</p>
                <span className="text-xs text-muted">Optional</span>
              </div>

              <input ref={fileRef} type="file" multiple accept={ACCEPTED_TYPES} onChange={addFiles} className="sr-only" aria-label="Choose PDF, Word, PPT, Image, or TXT files" />
              <Button type="button" variant="quiet" block disabled={submitting || files.length >= MAX_FILES_AT_CREATION} onClick={() => fileRef.current?.click()} className="min-h-16 flex-col gap-0.5 border-2 border-dashed">
                <span className="inline-flex items-center gap-2"><Paperclip size={17} /> {files.length > 0 ? 'Add more files' : 'Choose files (PDF, Word, PPT, Image, TXT)'}</span>
                <span className="text-xs font-normal text-muted">Up to 10MB each. You can also add materials after creating the project.</span>
              </Button>

              <Field label="Or import Google file / Web URL" htmlFor="np-url" optional>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <TextInput
                      id="np-url"
                      value={importUrl}
                      onChange={e => setImportUrl(e.target.value)}
                      placeholder="Paste Google Docs, Google Slides, or website link"
                      disabled={submitting}
                    />
                  </div>
                </div>
              </Field>

              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${f.size}`} className="flex items-center gap-2.5 rounded-xl border border-rule bg-paper py-1 pl-3 pr-1">
                      <FileText size={17} className="shrink-0 text-biro" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{f.name}</span>
                        <span className="block text-xs text-muted">{formatSize(f.size)}</span>
                      </span>
                      <IconButton label={`Remove ${f.name}`} onClick={() => removeFile(i)} disabled={submitting} className="h-10 w-10"><X size={16} /></IconButton>
                    </li>
                  ))}
                </ul>
              )}
              {fileError && <p role="alert" className="text-xs font-medium text-redpen">{fileError}</p>}
            </div>

            {serverError && <p role="alert" className="rounded-xl border border-redpen/30 bg-redpen-wash p-3 text-sm text-redpen">{serverError}</p>}
          </div>

          <div className="pb-safe border-t border-rule bg-chalk p-4">
            <Button type="submit" block loading={submitting}>{submitting && progress ? progress : submitLabel}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
