import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { CommandPalette } from '@/components/CommandPalette';
import { ConductorPanel } from '@/components/ConductorPanel';
import { getDb } from '@/lib/data';
import type { Command } from '@/lib/palette';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { getControlPlaneAuthMode } from '@/lib/control-plane/auth-config';
import { getRequestSession } from '@/lib/control-plane/request-auth';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { getRequestRegionalSettings } from '@/lib/i18n/server';
import { translate, type MessageKey } from '@/lib/i18n/catalog';
import type { SupportedLocale } from '@/lib/i18n/locales';

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'FOUNDER OS',
  description: 'Personal operating system and AI agent command center',
};

type LocalizedCommandSeed = Omit<Command, 'label'> & { labelKey?: MessageKey; label?: string };

const NAV_COMMANDS: LocalizedCommandSeed[] = [
  { id: 'nav-home', labelKey: 'nav.home', keywords: 'dashboard today overview start', href: '/', hint: 'view' },
  { id: 'nav-social', labelKey: 'nav.social', keywords: 'instagram tiktok twitter x youtube linkedin followers growth zernio founderos', href: '/social', hint: 'view' },
  { id: 'nav-comms', labelKey: 'nav.comms', keywords: 'messages email whatsapp slack inbox unified feed', href: '/comms', hint: 'view' },
  { id: 'nav-agents', labelKey: 'nav.agents', keywords: 'runtime run real roster', href: '/agents', hint: 'view' },
  { id: 'nav-connections', labelKey: 'nav.integrations', keywords: 'integrations tools status creds', href: '/integrations', hint: 'view' },
  { id: 'nav-roadmap', labelKey: 'nav.roadmap', keywords: 'plan phases quarters', href: '/roadmap', hint: 'view' },
  { id: 'nav-analytics', labelKey: 'nav.analytics', keywords: 'metrics numbers', href: '/analytics', hint: 'view' },
  { id: 'nav-reference', labelKey: 'nav.referenceModel', keywords: 'domains business brm', href: '/reference', hint: 'view' },
  { id: 'nav-org', labelKey: 'nav.orgChart', keywords: 'org chart hierarchy departments tree structure leads specialists', href: '/org', hint: 'view' },
  { id: 'nav-brain', labelKey: 'nav.knowledge', keywords: 'brain knowledge core markdown vector pgvector supabase embeddings zeroentropy graph doctor', href: '/brain', hint: 'view' },
  { id: 'ext-command-center', label: 'Command Center', keywords: 'command-center kanban missions port 4000', href: 'http://localhost:4000', hint: 'localhost' },
  { id: 'ext-remotion', label: 'Remotion Studio', keywords: 'video render pipeline port 3789', href: 'http://localhost:3789', hint: 'localhost' },
  { id: 'ext-skool', label: 'Skool Community', keywords: 'launchpad cohort community posts', href: 'https://www.skool.com/launchpad-cohort', hint: 'web' },
  { id: 'ext-attio', label: 'Attio CRM', keywords: 'deals pipeline vantage', href: 'https://app.attio.com', hint: 'web' },
  { id: 'ext-fathom', label: 'Fathom Calls', keywords: 'meetings recordings notes', href: 'https://fathom.video', hint: 'web' },
];

function buildCommands(locale: SupportedLocale): Command[] {
  const db = getDb();
  const nav: Command[] = NAV_COMMANDS.map((command) => ({
    id: command.id,
    label: command.labelKey ? translate(locale, command.labelKey) : command.label ?? command.id,
    keywords: command.keywords,
    href: command.href,
    hint: command.hint,
  }));
  const tools: Command[] = db.tools.all().map((tool) => ({
    id: `tool-${tool.id}`,
    label: tool.name,
    keywords: `${tool.category} ${tool.description}`,
    href: '/integrations',
    hint: translate(locale, 'common.tool').toLowerCase(),
  }));
  const agents: Command[] = db.agents.all().map((agent) => ({
    id: `agent-${agent.id}`,
    label: agent.name,
    keywords: `${agent.role} ${agent.description}`,
    href: '/agents',
    hint: translate(locale, 'common.agent').toLowerCase(),
  }));
  return [...nav, ...agents, ...tools];
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const regional = await getRequestRegionalSettings();
  const pathname = requestHeaders.get('x-founder-pathname') ?? '/';
  const authMode = getControlPlaneAuthMode();

  // /login is deliberately outside the authenticated product chrome.
  if (pathname === '/login' || pathname === '/access-pending' || pathname === '/accept-invite') {
    return (
      <html lang={regional.locale} className={fontMono.variable} suppressHydrationWarning>
        <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
        <body><I18nProvider regional={regional}>{children}</I18nProvider></body>
      </html>
    );
  }

  if (authMode === 'required') {
    const session = await getRequestSession();
    if (!session) {
      redirect(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }

  return (
    <html lang={regional.locale} className={fontMono.variable} suppressHydrationWarning>
      <head>
        {/* Apply the persisted theme before first paint — no dark↔light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <I18nProvider regional={regional}>
        <Sidebar />
        {/* os-shell yields to the Conductor dock: the panel sets --conductor-w
            and the whole content column glides left instead of being covered */}
        <div className="os-shell ml-[232px] flex min-h-screen min-w-0 flex-col" style={{ marginRight: 'var(--conductor-w, 0px)' }}>
          <Topbar />
          <main className="min-w-0 flex-1 px-8 pb-16 pt-7 wide:px-10 ultra:px-12">
            {/* Width tiers: 1280 on laptops · 1760 on large monitors ·
                full-bleed on 32"/ultrawide. See Tailwind v4 @theme breakpoints wide/ultra. */}
            <div className="mx-auto max-w-[1280px] wide:max-w-[1760px] ultra:max-w-none">
              {children}
            </div>
          </main>
        </div>
        <CommandPalette commands={buildCommands(regional.locale)} />
        {/* Notion-style agent dock — the Conductor, aware of the current screen */}
        <ConductorPanel />
        </I18nProvider>
      </body>
    </html>
  );
}
