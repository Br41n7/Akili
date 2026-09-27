'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Zap,
  Loader2,
  CheckCircle2,
  BarChart3,
  GraduationCap,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

function ImportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const bankId = searchParams.get('bank');
  const ref = searchParams.get('ref');

  const [status, setStatus] = useState<
    'checking' | 'importing' | 'done' | 'error' | 'no_auth'
  >('checking');

  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [bank, setBank] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!bankId) {
        if (!cancelled) {
          setStatus('error');
          setError('No question bank specified');
        }
        return;
      }

      try {
        // Check authentication
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setStatus('no_auth');
          }
          return;
        }

        // Fetch bank information for display
        const { data: bankData, error: bankError } = await supabase
          .from('question_banks')
          .select(
            'title, subject, exam_type, question_count'
          )
          .eq('id', bankId)
          .single();

        if (bankError) {
          console.warn(
            '[Import] Failed to fetch bank:',
            bankError
          );
        }

        if (!cancelled) {
          setBank(bankData);
        }

        // Check if already imported
        const checkRes = await fetch(
          `/api/import-pastq?bank_id=${encodeURIComponent(bankId)}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

        const checkData = await checkRes.json();

        if (!checkRes.ok) {
          throw new Error(
            checkData?.error ||
              'Unable to check import status'
          );
        }

        if (
          checkData.imported &&
          checkData.project_id
        ) {
          toast.success(
            'Already imported — opening project'
          );

          router.push(
            `/projects/${checkData.project_id}`
          );

          return;
        }

        if (!cancelled) {
          setStatus('importing');
        }

        // Run import
        const res = await fetch('/api/import-pastq', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bank_id: bankId,
            paystack_reference: ref,
          }),
        });

        const data = await res.json();

        if (!res.ok || data?.error) {
          throw new Error(
            data?.error || 'Import failed'
          );
        }

        if (cancelled) return;

        setResult(data);
        setStatus('done');
      } catch (err: unknown) {
        if (cancelled) return;

        const message =
          err instanceof Error
            ? err.message
            : 'Something went wrong during import';

        console.error('[Import Page]', err);

        setError(message);
        setStatus('error');
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [bankId, ref, router]);

  // --------------------------------------------------
  // NOT AUTHENTICATED
  // --------------------------------------------------

  if (status === 'no_auth') {
    return (
      <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto">
            <GraduationCap
              size={26}
              className="text-indigo-600"
            />
          </div>

          <h2 className="text-xl font-black">
            Sign in to Import
          </h2>

          <p className="text-sm text-gray-500">
            Create an Akili account or sign in to import
            your PastQ question bank.
          </p>

          <div className="flex gap-2">
            <Link
              href={`/auth/signup?bank=${bankId}&ref=${ref || ''}`}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm text-center"
            >
              Create Account
            </Link>

            <Link
              href={`/auth/login?redirect=${encodeURIComponent(
                `/import?bank=${bankId}&ref=${ref || ''}`
              )}`}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold text-sm text-center"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // CHECKING / IMPORTING
  // --------------------------------------------------

  if (
    status === 'checking' ||
    status === 'importing'
  ) {
    const isImporting = status === 'importing';

    return (
      <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-10 text-center space-y-5">
          <div className="w-16 h-16 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto">
            <Zap
              size={28}
              className="text-indigo-600"
            />
          </div>

          <div>
            <h2 className="text-xl font-black">
              {isImporting
                ? 'Building your course...'
                : 'Verifying purchase...'}
            </h2>

            {bank && (
              <p className="text-sm text-gray-500 mt-1">
                {bank.exam_type} {bank.subject} —{' '}
                {bank.question_count} questions
              </p>
            )}
          </div>

          <div className="space-y-2 text-left">
            {/* Step 1 */}
            <div className="flex items-center gap-3">
              {isImporting ? (
                <CheckCircle2
                  size={16}
                  className="text-emerald-600 shrink-0"
                />
              ) : (
                <Loader2
                  size={16}
                  className="text-indigo-400 animate-spin shrink-0"
                />
              )}

              <span
                className={`text-sm ${
                  isImporting
                    ? 'text-gray-800'
                    : 'text-gray-400'
                }`}
              >
                Verifying PastQ purchase
              </span>
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-3">
              {isImporting ? (
                <Loader2
                  size={16}
                  className="text-indigo-400 animate-spin shrink-0"
                />
              ) : (
                <Loader2
                  size={16}
                  className="text-gray-300 shrink-0"
                />
              )}

              <span
                className={`text-sm ${
                  isImporting
                    ? 'text-gray-800'
                    : 'text-gray-400'
                }`}
              >
                Importing questions
              </span>
            </div>

            {/* Step 3 */}
            <div className="flex items-center gap-3">
              <Loader2
                size={16}
                className={`shrink-0 ${
                  isImporting
                    ? 'text-indigo-400 animate-spin'
                    : 'text-gray-300'
                }`}
              />

              <span
                className={`text-sm ${
                  isImporting
                    ? 'text-gray-800'
                    : 'text-gray-400'
                }`}
              >
                Analysing topic frequency
              </span>
            </div>

            {/* Step 4 */}
            <div className="flex items-center gap-3">
              <Loader2
                size={16}
                className={`shrink-0 ${
                  isImporting
                    ? 'text-indigo-400 animate-spin'
                    : 'text-gray-300'
                }`}
              />

              <span
                className={`text-sm ${
                  isImporting
                    ? 'text-gray-800'
                    : 'text-gray-400'
                }`}
              >
                Generating structured course
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            This may take 30–60 seconds while AI builds
            your course.
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // ERROR
  // --------------------------------------------------

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-4">
          <AlertCircle
            size={32}
            className="mx-auto text-rose-500"
          />

          <h2 className="text-xl font-black">
            Import Failed
          </h2>

          <p className="text-sm text-gray-500">
            {error}
          </p>

          <p className="text-xs text-gray-400">
            This usually means the purchase wasn't
            completed. Go back to PastQ and complete the
            payment first.
          </p>

          <div className="flex gap-2">
            <a
              href={
                process.env.NEXT_PUBLIC_PASTQ_URL ||
                'https://pastq.co'
              }
              className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold text-sm text-center"
            >
              Back to PastQ
            </a>

            <Link
              href="/projects"
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold text-sm text-center"
            >
              My Projects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // SUCCESS
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-5">
        <div className="w-16 h-16 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto">
          <CheckCircle2
            size={28}
            className="text-emerald-600"
          />
        </div>

        <div>
          <h2 className="text-xl font-black">
            Import Complete!
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            Your question bank is ready to study
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          {/* Questions */}
          <div className="bg-indigo-50 rounded-2xl p-3">
            <p className="text-2xl font-black text-indigo-600">
              {result?.question_count ?? '—'}
            </p>

            <p className="text-[10px] text-gray-400">
              Questions
            </p>
          </div>

          {/* Topics */}
          <div className="bg-emerald-50 rounded-2xl p-3">
            <p className="text-2xl font-black text-emerald-600">
              {result?.topic_analysis?.topic_frequency
                ?.length || '—'}
            </p>

            <p className="text-[10px] text-gray-400">
              Topics Found
            </p>
          </div>

          {/* Course */}
          <div className="bg-amber-50 rounded-2xl p-3">
            <p className="text-2xl font-black text-amber-600">
              {result?.course_generated ? '✓' : '—'}
            </p>

            <p className="text-[10px] text-gray-400">
              Course Built
            </p>
          </div>
        </div>

        {/* Most tested topics */}
        {result?.topic_analysis?.top_topics?.length >
          0 && (
          <div className="bg-gray-50 rounded-2xl p-4 text-left">
            <p className="text-xs font-bold text-gray-500 mb-2">
              🔥 Most Tested Topics
            </p>

            {result.topic_analysis.top_topics
              .slice(0, 5)
              .map((topic: string, index: number) => (
                <p
                  key={`${topic}-${index}`}
                  className="text-sm py-1 border-b border-gray-100 last:border-0"
                >
                  <span className="text-gray-400 text-xs mr-2">
                    {index + 1}.
                  </span>

                  {topic}
                </p>
              ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href={`/projects/${result?.project_id}?tab=course`}
            className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          >
            <GraduationCap size={16} />
            Open Course
          </Link>

          <Link
            href={`/projects/${result?.project_id}?tab=analysis`}
            className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          >
            <BarChart3 size={16} />
            View Analysis
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ImportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center">
          <Loader2
            size={28}
            className="text-indigo-600 animate-spin"
          />
        </div>
      }
    >
      <ImportContent />
    </Suspense>
  );
}
