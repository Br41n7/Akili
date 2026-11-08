'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LanguageSwitch, useT } from '@/components/I18n';
import type { MessageKey } from '@/lib/i18n/messages';

const IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export default function FaqPage() {
  const { t } = useT();
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-biro"><ArrowLeft size={16} /> {t('faq.back')}</Link>
        <LanguageSwitch />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight">{t('faq.title')}</h1>
      <p className="mt-1 text-muted">{t('faq.subtitle')}</p>
      <div className="mt-6 space-y-2">
        {IDS.map(n => (
          <details key={n} className="group rounded-2xl border border-rule bg-paper p-4">
            <summary className="min-h-6 cursor-pointer list-none text-base font-bold marker:hidden">{t(`faq.q${n}` as MessageKey)}</summary>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t(`faq.a${n}` as MessageKey)}</p>
          </details>
        ))}
      </div>
    </main>
  );
}
