'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { GraduationCap, Loader2, MailCheck } from 'lucide-react';
import { RESET_SENT_MESSAGE } from '@/lib/auth-flow';

export default function ResetRequestPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/update-password` });
      // Rate limits and bad addresses are worth telling the person; "no such account" is not (it would reveal who has one).
      if (error && /rate|limit|too many|invalid/i.test(error.message)) throw error;
      setSent(true);
    } catch (err: any) {
      setError(/rate|limit|too many/i.test(err?.message || '') ? 'Too many attempts. Wait a few minutes and try again.' : 'Could not send the email. Check the address and try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center"><GraduationCap size={20} className="text-white" /></div>
            <span className="font-black text-xl">Akili</span>
          </Link>
          <h1 className="text-2xl font-black">Reset your password</h1>
          <p className="text-gray-500 text-sm mt-1">We will email you a link to choose a new one.</p>
        </div>
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
          {sent ? (
            <div className="text-center space-y-3" role="status">
              <MailCheck className="mx-auto text-emerald-600" size={32} />
              <p className="text-sm text-gray-600">{RESET_SENT_MESSAGE}</p>
              <p className="text-xs text-gray-400">Open the link in the same browser you used here.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="text-sm font-semibold block mb-1">Email</label>
                <input id="reset-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@gmail.com"
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-500 text-sm" />
              </div>
              {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
              <button type="submit" disabled={loading || !email.trim()}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : 'Send reset link'}
              </button>
            </form>
          )}
          <Link href="/auth/login" className="text-xs text-gray-400 hover:text-gray-600 block text-center mt-4">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
