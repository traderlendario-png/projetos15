/**
 * Single source of truth for the app's primary navigation. The Sidebar renders
 * these groups in order; the CommandPalette derives its digit (1–9) shortcuts
 * from the same visible order, so the two can never drift apart again.
 */
import {
  Stethoscope,
  Home,
  MessageSquare,
  Share2,
  Clapperboard,
  Users,
  ListChecks,
  Sparkles,
  Network,
  Brain,
  Wallet,
  Filter,
  Workflow,
  Map,
  Plug,
  BarChart3,
  LayoutGrid,
  Layers,
} from 'lucide-react';
import type { MessageKey } from '@/lib/i18n/catalog';

export type NavItem = { href: string; labelKey: MessageKey; icon: typeof Home };

export const NAV_OPERATE: NavItem[] = [
  { href: '/', labelKey: 'nav.home', icon: Home },
  { href: '/comms', labelKey: 'nav.comms', icon: MessageSquare },
  { href: '/funnel', labelKey: 'nav.funnel', icon: Filter },
  { href: '/workflows', labelKey: 'nav.workflows', icon: Workflow },
  { href: '/social', labelKey: 'nav.social', icon: Share2 },
  { href: '/content', labelKey: 'nav.content', icon: Clapperboard },
  { href: '/finances', labelKey: 'nav.finances', icon: Wallet },
];

// The agent workforce: the roster and the org chart that maps how they report.
export const NAV_AGENTS: NavItem[] = [
  { href: '/agents', labelKey: 'nav.agents', icon: Users },
  { href: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { href: '/skills', labelKey: 'nav.skills', icon: Sparkles },
  { href: '/org', labelKey: 'nav.orgChart', icon: Network },
];

// The knowledge layer the agents draw on.
// The knowledge layer the agents draw on. G-Brain is the pure knowledge graph;
// Doctor holds the engine's health readouts (pillar health, doctor, storage
// layers, pipeline, query path) so the graph tab stays a single view.
export const NAV_INTELLIGENCE: NavItem[] = [
  { href: '/brain', labelKey: 'nav.knowledge', icon: Brain },
  { href: '/doctor', labelKey: 'nav.systemHealth', icon: Stethoscope },
];

export const NAV_SYSTEM: NavItem[] = [
  { href: '/integrations', labelKey: 'nav.integrations', icon: Plug },
  { href: '/roadmap', labelKey: 'nav.roadmap', icon: Map },
  { href: '/analytics', labelKey: 'nav.analytics', icon: BarChart3 },
  { href: '/reference', labelKey: 'nav.referenceModel', icon: LayoutGrid },
];

// At the very bottom: persona templates that can run variants of this platform.
export const NAV_LIBRARY: NavItem[] = [{ href: '/personas', labelKey: 'nav.personas', icon: Layers }];

/** Visible top-to-bottom order across all groups. */
export const NAV_ORDER: string[] = [
  ...NAV_OPERATE,
  ...NAV_AGENTS,
  ...NAV_INTELLIGENCE,
  ...NAV_SYSTEM,
  ...NAV_LIBRARY,
].map((n) => n.href);

/** Digit keys 1–9 jump to the first nine views in visible order. */
export const DIGIT_VIEWS: string[] = NAV_ORDER.slice(0, 9);
