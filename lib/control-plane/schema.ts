import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  MembershipStatus,
  OrganizationStatus,
  SubscriptionStatus,
  SupportedLocale,
  WorkspaceBindingStatus,
} from './types';

export const controlPlane = pgSchema('control_plane');

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
};

export const users = controlPlane.table(
  'users',
  {
    id: uuid('id').primaryKey(),
    externalAuthId: text('external_auth_id'),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    displayName: text('display_name').notNull().default(''),
    status: text('status').$type<'active' | 'disabled'>().notNull().default('active'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_email_normalized_uidx').on(table.emailNormalized),
    uniqueIndex('users_external_auth_id_uidx').on(table.externalAuthId),
  ],
);

export const organizations = controlPlane.table(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: text('status').$type<OrganizationStatus>().notNull().default('active'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [uniqueIndex('organizations_slug_uidx').on(table.slug)],
);

export const regionalPreferences = controlPlane.table(
  'regional_preferences',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locale: text('locale').$type<SupportedLocale>().notNull().default('pt-BR'),
    country: text('country').notNull().default('BR'),
    currency: text('currency').notNull().default('BRL'),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    firstDayOfWeek: integer('first_day_of_week').notNull().default(1),
    ...timestamps,
  },
);

export const userPreferences = controlPlane.table(
  'user_preferences',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    locale: text('locale').$type<SupportedLocale>(),
    country: text('country'),
    currency: text('currency'),
    timezone: text('timezone'),
    firstDayOfWeek: integer('first_day_of_week'),
    ...timestamps,
  },
);

export const memberships = controlPlane.table(
  'memberships',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').$type<MembershipStatus>().notNull().default('active'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('memberships_org_user_uidx').on(table.organizationId, table.userId),
    index('memberships_user_idx').on(table.userId),
  ],
);

export const permissions = controlPlane.table('permissions', {
  key: text('key').primaryKey(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const roles = controlPlane.table(
  'roles',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('roles_org_key_uidx').on(table.organizationId, table.key)],
);

export const rolePermissions = controlPlane.table(
  'role_permissions',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key')
      .notNull()
      .references(() => permissions.key, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionKey] })],
);

export const membershipRoles = controlPlane.table(
  'membership_roles',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.membershipId, table.roleId] })],
);

export const workspaceBindings = controlPlane.table(
  'workspace_bindings',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').$type<WorkspaceBindingStatus>().notNull().default('active'),
    isDefault: boolean('is_default').notNull().default(false),
    engineTenantId: text('engine_tenant_id').notNull(),
    engineOrganizationId: text('engine_organization_id'),
    engineWorkspaceId: text('engine_workspace_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('workspace_bindings_org_slug_uidx').on(table.organizationId, table.slug),
    uniqueIndex('workspace_bindings_org_engine_ws_uidx').on(table.organizationId, table.engineWorkspaceId),
    index('workspace_bindings_engine_ws_idx').on(table.engineWorkspaceId),
    uniqueIndex('workspace_bindings_one_default_per_org_uidx')
      .on(table.organizationId)
      .where(sql`${table.isDefault} = true and ${table.status} = 'active'`),
  ],
);

export const plans = controlPlane.table('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').$type<'active' | 'retired'>().notNull().default('active'),
  entitlements: jsonb('entitlements').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const subscriptions = controlPlane.table(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: text('plan_id').references(() => plans.id, { onDelete: 'set null' }),
    provider: text('provider').notNull().default('stripe'),
    externalCustomerId: text('external_customer_id'),
    externalSubscriptionId: text('external_subscription_id'),
    status: text('status').$type<SubscriptionStatus>().notNull().default('incomplete'),
    seatLimit: integer('seat_limit'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true, mode: 'date' }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true, mode: 'date' }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index('subscriptions_org_idx').on(table.organizationId),
    uniqueIndex('subscriptions_provider_external_uidx').on(table.provider, table.externalSubscriptionId),
  ],
);


export const userIdentities = controlPlane.table(
  'user_identities',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    emailAtLink: text('email_at_link'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_identities_provider_subject_uidx').on(table.provider, table.subject),
    index('user_identities_user_idx').on(table.userId),
  ],
);

export const userSessions = controlPlane.table(
  'user_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    identityId: uuid('identity_id').references(() => userIdentities.id, { onDelete: 'set null' }),
    tokenHash: text('token_hash').notNull(),
    activeOrganizationId: uuid('active_organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    activeWorkspaceBindingId: uuid('active_workspace_binding_id').references(() => workspaceBindings.id, { onDelete: 'set null' }),
    authMethod: text('auth_method').notNull().default('external'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    uniqueIndex('user_sessions_token_hash_uidx').on(table.tokenHash),
    index('user_sessions_user_idx').on(table.userId),
    index('user_sessions_active_org_idx').on(table.activeOrganizationId),
  ],
);

export const invitations = controlPlane.table(
  'invitations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    roleKey: text('role_key').$type<'owner' | 'admin' | 'operator' | 'viewer'>().notNull(),
    tokenHash: text('token_hash').notNull(),
    status: text('status').$type<'pending' | 'accepted' | 'revoked' | 'expired'>().notNull().default('pending'),
    invitedBy: uuid('invited_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('invitations_token_hash_uidx').on(table.tokenHash),
    index('invitations_org_status_idx').on(table.organizationId, table.status),
    index('invitations_email_idx').on(table.emailNormalized, table.status),
  ],
);

export const accessAuditLog = controlPlane.table(
  'access_audit_log',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    requestId: text('request_id'),
    outcome: text('outcome').$type<'success' | 'denied' | 'error'>().notNull().default('success'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('access_audit_org_time_idx').on(table.organizationId, table.occurredAt),
    index('access_audit_actor_time_idx').on(table.actorId, table.occurredAt),
  ],
);


export type ControlPlaneUser = typeof users.$inferSelect;
export type ControlPlaneOrganization = typeof organizations.$inferSelect;
export type ControlPlaneUserPreference = typeof userPreferences.$inferSelect;
export type ControlPlaneMembership = typeof memberships.$inferSelect;
export type ControlPlaneWorkspaceBinding = typeof workspaceBindings.$inferSelect;
export type ControlPlaneUserIdentity = typeof userIdentities.$inferSelect;
export type ControlPlaneUserSession = typeof userSessions.$inferSelect;
export type ControlPlaneInvitation = typeof invitations.$inferSelect;
