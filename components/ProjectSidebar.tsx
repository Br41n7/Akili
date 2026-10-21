'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoMark } from '@/components/ui';

export interface SidebarItem<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  desc?: string;
}

const STORAGE_KEY = 'akili_sidebar_collapsed';

/**
 * Desktop (lg+) collapsible project navigation. Ported from Academia AI's
 * ProjectLayout sidebar, restyled with Akili tokens. Tablet and phone keep
 * the existing top tab row and bottom bar, so this renders nothing below lg.
 * The collapsed state is a per-viewer convenience: stored in localStorage
 * inside try/catch, and the sidebar works without it.
 */
export default function ProjectSidebar<T extends string>({
  items, active, onSelect, projectName, backHref = '/projects',
}: {
  items: SidebarItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  projectName: string;
  backHref?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORAGE_KEY) === '1'); } catch { /* storage unavailable */ }
  }, []);

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <aside
      aria-label="Project navigation"
      className={cn(
        'pt-safe sticky top-0 hidden h-dvh shrink-0 flex-col self-start border-r border-rule bg-paper transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div className={cn('flex h-14 items-center border-b border-rule', collapsed ? 'justify-center' : 'gap-3 px-4')}>
        <LogoMark size={28} />
        {!collapsed && <span className="truncate text-[15px] font-bold" title={projectName}>{projectName}</span>}
      </div>

      <nav aria-label="Project sections" className="no-scrollbar flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(t => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              aria-current={on ? 'page' : undefined}
              aria-label={collapsed ? t.label : undefined}
              title={collapsed ? t.label : t.desc}
              className={cn(
                'flex min-h-11 w-full items-center rounded-xl text-sm font-semibold transition-colors',
                collapsed ? 'justify-center' : 'gap-3 px-3',
                on ? 'bg-ink text-white' : 'text-ink hover:bg-ink/5',
              )}
            >
              <t.icon size={19} strokeWidth={on ? 2.5 : 2} />
              {!collapsed && <span className="truncate">{t.label}</span>}
              {on && !collapsed && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-marker" aria-hidden />}
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-rule p-3">
        <Link
          href={backHref}
          aria-label={collapsed ? 'All projects' : undefined}
          title={collapsed ? 'All projects' : undefined}
          className={cn('flex min-h-11 w-full items-center rounded-xl text-sm font-medium text-muted hover:bg-ink/5 hover:text-ink', collapsed ? 'justify-center' : 'gap-3 px-3')}
        >
          <ArrowLeft size={19} />
          {!collapsed && <span>All projects</span>}
        </Link>
        <button
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn('flex min-h-11 w-full items-center rounded-xl text-sm font-medium text-muted hover:bg-ink/5 hover:text-ink', collapsed ? 'justify-center' : 'gap-3 px-3')}
        >
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
