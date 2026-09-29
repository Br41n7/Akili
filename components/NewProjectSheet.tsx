'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, GraduationCap, School, X } from 'lucide-react';
import {
  EDUCATION_LEVELS, EXAM_BOARDS, SECONDARY_CLASSES, SECONDARY_SUBJECTS, STUDY_GOALS, UNIVERSITY_YEARS, OTHER,
  createProjectSchema, type EducationLevel, type ProjectRecord, type StudyGoal,
} from '@/lib/project-context';
import { Button, ChoiceChips, Field, IconButton, SelectInput, TextArea, TextInput } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (project: ProjectRecord) => void;
}

const blank = {
  name: '', description: '',
  subject: '', subjectOther: '', exam_board: '', class_level: '',
  institution: '', department: '', course_code: '', study_year: '',
  study_goal: '' as StudyGoal | '',
};

export default function NewProjectSheet({ open, onClose, onCreated }: Props) {
  const [level, setLevel] = useState<EducationLevel | null>(null);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLevel(null); setForm(blank); setErrors({}); setServerError('');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const set = (key: keyof typeof blank) => (value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => { const { [key]: _drop, ...rest } = e; return rest; });
  };

  const subjectValue = form.subject === OTHER ? form.subjectOther.trim() : form.subject;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!level) return;
    setServerError('');

    const payload = level === 'secondary'
      ? { education_level: level, name: form.name, subject: subjectValue, exam_board: form.exam_board || undefined, class_level: form.class_level, description: form.description, study_goal: form.study_goal || undefined }
      : { education_level: level, name: form.name, subject: form.subject, course_code: form.course_code, institution: form.institution, department: form.department, study_year: form.study_year, description: form.description, study_goal: form.study_goal || undefined };

    const check = createProjectSchema.safeParse(payload);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) next[String(issue.path[0])] ||= issue.message;
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(check.data) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.project) {
        if (data?.fields) setErrors(data.fields);
        throw new Error(data?.error || 'We could not create the project. Please try again.');
      }
      onCreated(data.project as ProjectRecord);
    } catch (err: any) {
      setServerError(err?.message || 'We could not create the project. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const goals = level ? STUDY_GOALS[level] : [];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 animate-fade sm:items-center" onClick={() => !submitting && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onClick={e => e.stopPropagation()}
        className="flex max-h-[94dvh] w-full max-w-lg animate-sheet flex-col rounded-t-3xl bg-chalk sm:max-h-[88dvh] sm:rounded-3xl"
      >
        <header className="flex items-center gap-1 border-b border-rule px-2 py-2">
          {level ? (
            <IconButton label="Back" onClick={() => setLevel(null)} disabled={submitting}><ArrowLeft size={20} /></IconButton>
          ) : <span className="w-2" />}
          <h2 id="new-project-title" className="flex-1 px-1 text-lg font-bold">
            {level ? (level === 'secondary' ? 'Secondary / O-Level project' : 'University project') : 'What are you studying for?'}
          </h2>
          <IconButton label="Close" onClick={onClose} disabled={submitting}><X size={20} /></IconButton>
        </header>

        {!level ? (
          <div className="space-y-3 overflow-y-auto p-4 pb-safe">
            {EDUCATION_LEVELS.map(l => (
              <button
                key={l.value}
                onClick={() => setLevel(l.value)}
                className="flex w-full items-center gap-4 rounded-2xl border border-rule bg-paper p-4 text-left transition-colors hover:border-ink/50 active:bg-chalk"
              >
                <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', l.value === 'secondary' ? 'bg-marker-wash text-ink' : 'bg-biro-wash text-biro-dark')}>
                  {l.value === 'secondary' ? <School size={24} /> : <GraduationCap size={24} />}
                </span>
                <span>
                  <span className="block text-base font-bold">{l.label}</span>
                  <span className="block text-sm text-muted">{l.hint}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {level === 'secondary' ? (
                <>
                  <Field label="Subject" htmlFor="np-subject" error={errors.subject}>
                    <SelectInput id="np-subject" value={form.subject} onChange={e => set('subject')(e.target.value)} aria-invalid={!!errors.subject}>
                      <option value="">Choose a subject</option>
                      {SECONDARY_SUBJECTS.map(s => <option key={s}>{s}</option>)}
                      <option>{OTHER}</option>
                    </SelectInput>
                  </Field>
                  {form.subject === OTHER && (
                    <Field label="Subject name" htmlFor="np-subject-other" error={errors.subject}>
                      <TextInput id="np-subject-other" value={form.subjectOther} onChange={e => set('subjectOther')(e.target.value)} placeholder="e.g. Data Processing" maxLength={60} />
                    </Field>
                  )}
                  <Field label="Exam" htmlFor="np-board" error={errors.exam_board}>
                    <SelectInput id="np-board" value={form.exam_board} onChange={e => set('exam_board')(e.target.value)} aria-invalid={!!errors.exam_board}>
                      <option value="">Choose an exam</option>
                      {EXAM_BOARDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </SelectInput>
                  </Field>
                  <Field label="Class" htmlFor="np-class" optional>
                    <SelectInput id="np-class" value={form.class_level} onChange={e => set('class_level')(e.target.value)}>
                      <option value="">Choose your class</option>
                      {SECONDARY_CLASSES.map(c => <option key={c}>{c}</option>)}
                    </SelectInput>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Course title" htmlFor="np-course" optional hint="For example: Human Anatomy or Microeconomics">
                    <TextInput id="np-course" value={form.subject} onChange={e => set('subject')(e.target.value)} maxLength={80} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Course code" htmlFor="np-code" optional>
                      <TextInput id="np-code" value={form.course_code} onChange={e => set('course_code')(e.target.value)} placeholder="ANA 201" maxLength={20} autoCapitalize="characters" />
                    </Field>
                    <Field label="Year" htmlFor="np-year" optional>
                      <SelectInput id="np-year" value={form.study_year} onChange={e => set('study_year')(e.target.value)}>
                        <option value="">Choose</option>
                        {UNIVERSITY_YEARS.map(y => <option key={y}>{y}</option>)}
                      </SelectInput>
                    </Field>
                  </div>
                  <Field label="University" htmlFor="np-uni" optional>
                    <TextInput id="np-uni" value={form.institution} onChange={e => set('institution')(e.target.value)} placeholder="e.g. University of Ibadan" maxLength={80} />
                  </Field>
                  <Field label="Department" htmlFor="np-dept" optional>
                    <TextInput id="np-dept" value={form.department} onChange={e => set('department')(e.target.value)} placeholder="e.g. Physiotherapy" maxLength={80} />
                  </Field>
                </>
              )}

              <Field label="Project name" htmlFor="np-name" error={errors.name} hint="This is how it will appear on your dashboard.">
                <TextInput
                  id="np-name"
                  value={form.name}
                  onChange={e => set('name')(e.target.value)}
                  placeholder={level === 'secondary' ? 'WAEC Biology revision' : 'ANA 201 semester notes'}
                  maxLength={80}
                  aria-invalid={!!errors.name}
                />
              </Field>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold">What is your goal? <span className="text-xs font-normal text-muted">Optional</span></p>
                <ChoiceChips label="Study goal" options={goals} value={form.study_goal} onChange={v => set('study_goal')(v)} />
              </div>

              <Field label="Notes for Akili" htmlFor="np-desc" optional hint="Anything that should shape the lessons, such as topics your teacher stressed.">
                <TextArea id="np-desc" rows={2} value={form.description} onChange={e => set('description')(e.target.value)} maxLength={300} />
              </Field>

              {serverError && <p role="alert" className="rounded-xl border border-redpen/30 bg-redpen-wash p-3 text-sm text-redpen">{serverError}</p>}
            </div>

            <div className="pb-safe border-t border-rule bg-chalk p-4">
              <Button type="submit" block loading={submitting}>Create project</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
