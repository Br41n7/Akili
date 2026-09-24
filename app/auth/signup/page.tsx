'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { GraduationCap, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const REGIONS = ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'India', 'Other'];

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', region: 'Nigeria',
    // Pre-fill bank context if coming from PastQ import
    bank_id: searchParams.get('bank') || '',
    ref: searchParams.get('ref') || '',
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (key: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } }
      });
      if (error) throw error;

      // Update profile with region
      if (data.user) {
        await supabase.from('profiles').update({ region: form.region }).eq('id', data.user.id);
      }

      toast.success('Account created! Check your email to confirm.');

      // If coming from PastQ import, redirect there
      if (form.bank_id && form.ref) {
        router.push(`/import?bank=${form.bank_id}&ref=${form.ref}`);
      } else {
        router.push('/projects');
      }
    } catch (err: any) {
      toast.error(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const comingFromPastQ = !!(form.bank_id && form.ref);

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <GraduationCap size={20} className="text-white" />
            </div>
            <span className="font-black text-xl">Akili</span>
          </Link>
          <h1 className="text-2xl font-black">
            {comingFromPastQ ? 'Create account to import' : 'Start studying smarter'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-indigo-600 font-semibold">Sign in</Link>
          </p>
        </div>

        {comingFromPastQ && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-3 mb-4 text-sm text-green-700 text-center">
            🎉 Create an account to import your PastQ question bank
          </div>
        )}

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-semibold block mb-1">Full Name</label>
              <input value={form.full_name} onChange={set('full_name')} required
                placeholder="Your full name"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-500 text-sm" />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Email</label>
              <input type="email" value={form.email} onChange={set('email')} required
                placeholder="you@gmail.com"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-500 text-sm" />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Your Country</label>
              <select value={form.region} onChange={set('region')}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-500 text-sm">
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                AI will use examples familiar to your region 🌍
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={form.password}
                  onChange={set('password')} required minLength={8}
                  placeholder="Min. 8 characters"
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-500 text-sm pr-12" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Creating account...</> : 'Create Account'}
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-4">
            By signing up you agree to our Terms of Service
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>;
}
