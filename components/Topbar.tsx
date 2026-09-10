'use client';

import { usePathname } from 'next/navigation';
import { Bot, Search } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { OsMark } from '@/components/OsMark';
import { CONDUCTOR_OPEN_EVENT } from '@/components/ConductorPanel';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { MessageKey } from '@/lib/i18n/catalog';

const SEGMENT_LABELS: Record<string, MessageKey> = {
  '': 'nav.home',
  social: 'nav.social',
  comms: 'nav.comms',
  funnel: 'nav.funnel',
  workflows: 'nav.workflows',
  content: 'nav.content',
  finances: 'nav.finances',
  agents: 'nav.agents',
  tasks: 'nav.tasks',
  skills: 'nav.skills',
  org: 'nav.orgChart',
  brain: 'nav.knowledge',
  doctor: 'nav.systemHealth',
  integrations: 'nav.integrations',
  roadmap: 'nav.roadmap',
  analytics: 'nav.analytics',
  reference: 'nav.referenceModel',
  personas: 'nav.personas',
};

export function openPalette() {
  window.dispatchEvent(new CustomEvent('alex:palette'));
}

export function Topbar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const segment = pathname.split('/')[1] ?? '';
  const key = SEGMENT_LABELS[segment];
  const here = key ? t(key) : segment;

  return (
    <div className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-3.5 border-b border-os-border bg-os-bg2/70 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-[7px] whitespace-nowrap font-mono text-[11px] tracking-[0.04em] text-os-dim">
        <span>{t('topbar.breadcrumbRoot')} {/* founder-os */}</span>
        <span className="opacity-45">/</span>
        <span className="text-os-text">{here}</span>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <LocaleSwitcher />
        <ThemeToggle />
        <button
          onClick={openPalette}
          title={t('topbar.commandPalette')}
          aria-label={t('topbar.commandPalette')}
          className="grid h-[30px] w-[30px] place-items-center rounded-sm-t border border-os-border bg-os-surface text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent(CONDUCTOR_OPEN_EVENT))}
          title={t('topbar.askConductor')}
          aria-label={t('topbar.openConductor')}
          className="grid h-[30px] w-[30px] place-items-center rounded-sm-t border border-os-border bg-os-surface text-os-muted transition-colors hover:border-os-border-strong hover:text-os-accent"
        >
          <Bot className="h-3.5 w-3.5" />
        </button>
        <OsMark size={26} className="ml-1 shrink-0" />
      </div>
    </div>
  );
}

