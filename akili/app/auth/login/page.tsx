'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { GraduationCap, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push('/projects');
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-2xl font-black">Welcome back</h1>
          <p className="text-gray-500 text-sm mt-1">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="text-indigo-600 font-semibold">Sign up free</Link>
          </p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-semibold block mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@gmail.com"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-500 text-sm" />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} required
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-500 text-sm pr-12" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in...</> : 'Sign In'}
            </button>
          </form>
          <div className="text-center mt-4 space-y-2">
            <Link href="/auth/reset" className="text-xs text-gray-400 hover:text-gray-600 block">
              Forgot password?
            </Link>
            <p className="text-xs text-gray-400">
              Study with past questions?{' '}
              <a href={process.env.NEXT_PUBLIC_PASTQ_URL || 'https://pastq.co'}
                target="_blank" rel="noopener noreferrer"
                className="text-green-600 font-semibold">
                Visit PastQ →
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
