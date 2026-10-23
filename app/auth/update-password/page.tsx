'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { GraduationCap, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { MIN_PASSWORD, recoveryLinkError, validateNewPassword } from '@/lib/auth-flow';

type Phase = 'checking' | 'ready' | 'invalid';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');
  const [problem, setProblem] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let done = false;
    const ready = () => { if (!done) { done = true; setPhase('ready'); } };
    const invalid = (m: string) => { if (!done) { done = true; setProblem(m); setPhase('invalid'); } };

    const linkError = recoveryLinkError(window.location.search, window.location.hash);
    if (linkError) { invalid(linkError); return; }

    // Hash-style links sign the person in on their own and fire this event.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) ready();
    });

    (async () => {
      try {
        // Code-style (PKCE) links carry ?code=; it is exchanged once, here, in the browser that asked for the reset.
        const code = new URLSearchParams(window.location.search).get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) { invalid('This reset link has expired, was already used, or was opened in a different browser. Request a new one.'); return; }
          window.history.replaceState(null, '', window.location.pathname);
          ready(); return;
        }
        const { data } = await supabase.auth.getSession();
        if (data.session) ready();
        else setTimeout(() => invalid('Open this page from the link in your reset email.'), 1500);
      } catch { invalid('Could not check the reset link. Request a new one.'); }
    })();

    return () => { done = true; sub.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated');
      router.replace('/projects');
    } catch (err: any) {
      setError(err?.message || 'Could not update the password. Request a new link and try again.');
    } finally { setSaving(false); }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center"><GraduationCap size={20} className="text-white" /></div>
            <span className="font-black text-xl">Akili</span>
          </Link>
          <h1 className="text-2xl font-black">Choose a new password</h1>
        </div>
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">{children}</div>
      </div>
    </div>
  );

  if (phase === 'checking') return shell(<div className="flex justify-center py-6" role="status" aria-label="Checking your link"><Loader2 className="animate-spin text-indigo-600" /></div>);
  if (phase === 'invalid') return shell(
    <div className="text-center space-y-4">
      <AlertCircle className="mx-auto text-rose-500" size={30} />
      <p role="alert" className="text-sm text-gray-600">{problem}</p>
      <Link href="/auth/reset" className="block w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm">Request a new link</Link>
    </div>);

  return shell(
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="np" className="text-sm font-semibold block mb-1">New password</label>
        <input id="np" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={MIN_PASSWORD} autoComplete="new-password"
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-500 text-sm" />
        <p className="text-xs text-gray-400 mt-1">At least {MIN_PASSWORD} characters.</p>
      </div>
      <div>
        <label htmlFor="np2" className="text-sm font-semibold block mb-1">Confirm password</label>
        <input id="np2" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password"
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-500 text-sm" />
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={saving}
        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2">
        {saving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Update password'}
      </button>
    </form>);
}
