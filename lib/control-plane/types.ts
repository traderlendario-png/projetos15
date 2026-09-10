import { z } from 'zod';
import { SUPPORTED_LOCALES, sanitizeTimezone, type SupportedLocale } from '@/lib/i18n/locales';

export const SupportedLocaleSchema = z.enum(SUPPORTED_LOCALES);
export type { SupportedLocale };

export const OrganizationStatusSchema = z.enum(['active', 'suspended', 'archived']);
export type OrganizationStatus = z.infer<typeof OrganizationStatusSchema>;

export const MembershipStatusSchema = z.enum(['invited', 'active', 'suspended']);
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;

export const SubscriptionStatusSchema = z.enum([
  'trialing',
  'active',
  'past_due',
  'paused',
  'canceled',
  'incomplete',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const WorkspaceBindingStatusSchema = z.enum(['active', 'disabled']);
export type WorkspaceBindingStatus = z.infer<typeof WorkspaceBindingStatusSchema>;

export const RegionPreferencesSchema = z.object({
  locale: SupportedLocaleSchema,
  country: z.string().regex(/^[A-Z]{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().trim().min(1).max(100).refine((value) => sanitizeTimezone(value, '') === value, 'Invalid IANA timezone'),
  firstDayOfWeek: z.number().int().min(0).max(6),
});
export type RegionPreferences = z.infer<typeof RegionPreferencesSchema>;

export const DEFAULT_REGION_PREFERENCES: RegionPreferences = {
  locale: 'pt-BR',
  country: 'BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  firstDayOfWeek: 1,
};

export const PermissionKeySchema = z.enum([
  'app.read',
  'app.write',
  'organization.read',
  'organization.manage',
  'members.read',
  'members.manage',
  'workspaces.read',
  'workspaces.manage',
  'billing.read',
  'billing.manage',
  'settings.read',
  'settings.manage',
  'agents.run',
  'agents.manage',
  'knowledge.read',
  'knowledge.write',
  'integrations.read',
  'integrations.manage',
  'approvals.read',
  'approvals.decide',
  'audit.read',
]);
export type PermissionKey = z.infer<typeof PermissionKeySchema>;

export const SYSTEM_PERMISSION_KEYS = PermissionKeySchema.options;

export const ControlPlaneScopeSchema = z.object({
  organizationId: z.string().uuid(),
  actorId: z.string().uuid().optional(),
  requestId: z.string().min(1).max(200).optional(),
});
export type ControlPlaneScope = z.infer<typeof ControlPlaneScopeSchema>;

export const BootstrapOrganizationInputSchema = z.object({
  organization: z.object({
    name: z.string().trim().min(1).max(160),
    slug: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
  }),
  owner: z.object({
    email: z.string().trim().email(),
    displayName: z.string().trim().min(1).max(160),
    externalAuthId: z.string().trim().min(1).max(255).optional(),
  }),
  region: RegionPreferencesSchema.default(DEFAULT_REGION_PREFERENCES),
  optimalEngine: z
    .object({
      tenantId: z.string().trim().min(1),
      organizationId: z.string().trim().min(1).optional(),
      workspaceId: z.string().trim().min(1),
      workspaceName: z.string().trim().min(1).max(160).default('Principal'),
      workspaceSlug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/).default('principal'),
    })
    .optional(),
});
export type BootstrapOrganizationInput = z.infer<typeof BootstrapOrganizationInputSchema>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
