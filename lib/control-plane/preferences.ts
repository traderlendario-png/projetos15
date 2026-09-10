import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getControlPlaneConnection } from './client';
import { SupportedLocaleSchema } from './types';
import type { AuthenticatedSession } from './sessions';
import {
  DEFAULT_REGIONAL_SETTINGS,
  matchSupportedLocale,
  sanitizeCountry,
  sanitizeCurrency,
  sanitizeFirstDayOfWeek,
  sanitizeTimezone,
  type RegionalSettings,
} from '@/lib/i18n/locales';

export const UserPreferencesPatchSchema = z.object({
  locale: SupportedLocaleSchema.optional(),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()).optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional(),
  timezone: z.string().trim().min(1).max(100).refine((value) => sanitizeTimezone(value, '') === value, 'Invalid IANA timezone').optional(),
  firstDayOfWeek: z.number().int().min(0).max(6).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one preference is required');
export type UserPreferencesPatch = z.infer<typeof UserPreferencesPatchSchema>;

type RegionalRow = {
  locale: string | null;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  first_day_of_week: number | null;
};

/**
 * Effective presentation settings. Human overrides win over organization
 * defaults. Language, country, currency and timezone remain independent.
 */
export async function loadEffectiveRegionalSettings(
  tx: postgres.TransactionSql,
  userId: string,
  organizationId: string | null,
): Promise<RegionalSettings> {
  const rows = await tx<RegionalRow[]>`
    SELECT
      COALESCE(up.locale, rp.locale, ${DEFAULT_REGIONAL_SETTINGS.locale}) AS locale,
      COALESCE(up.country, rp.country, ${DEFAULT_REGIONAL_SETTINGS.country}) AS country,
      COALESCE(up.currency, rp.currency, ${DEFAULT_REGIONAL_SETTINGS.currency}) AS currency,
      COALESCE(up.timezone, rp.timezone, ${DEFAULT_REGIONAL_SETTINGS.timezone}) AS timezone,
      COALESCE(up.first_day_of_week, rp.first_day_of_week, ${DEFAULT_REGIONAL_SETTINGS.firstDayOfWeek}) AS first_day_of_week
    FROM (SELECT 1) seed
    LEFT JOIN control_plane.user_preferences up ON up.user_id = ${userId}
    LEFT JOIN control_plane.regional_preferences rp ON rp.organization_id = ${organizationId}
    LIMIT 1
  `;
  const row = rows[0];
  return {
    locale: matchSupportedLocale(row?.locale) ?? DEFAULT_REGIONAL_SETTINGS.locale,
    country: sanitizeCountry(row?.country),
    currency: sanitizeCurrency(row?.currency),
    timezone: sanitizeTimezone(row?.timezone),
    firstDayOfWeek: sanitizeFirstDayOfWeek(row?.first_day_of_week),
  };
}

export async function updateUserPreferences(input: {
  session: AuthenticatedSession;
  patch: UserPreferencesPatch;
  requestId?: string;
}): Promise<RegionalSettings> {
  const patch = UserPreferencesPatchSchema.parse(input.patch);
  const { sql } = getControlPlaneConnection();
  return sql.begin(async (tx) => {
    await tx`select set_config('founder_os.actor_id', ${input.session.user.id}, true)`;
    if (input.session.organization) {
      await tx`select set_config('founder_os.organization_id', ${input.session.organization.id}, true)`;
    }

    await tx`
      INSERT INTO control_plane.user_preferences (
        user_id, locale, country, currency, timezone, first_day_of_week
      ) VALUES (
        ${input.session.user.id}, ${patch.locale ?? null}, ${patch.country ?? null},
        ${patch.currency ?? null}, ${patch.timezone ?? null}, ${patch.firstDayOfWeek ?? null}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        locale = COALESCE(EXCLUDED.locale, control_plane.user_preferences.locale),
        country = COALESCE(EXCLUDED.country, control_plane.user_preferences.country),
        currency = COALESCE(EXCLUDED.currency, control_plane.user_preferences.currency),
        timezone = COALESCE(EXCLUDED.timezone, control_plane.user_preferences.timezone),
        first_day_of_week = COALESCE(EXCLUDED.first_day_of_week, control_plane.user_preferences.first_day_of_week)
    `;

    if (input.session.organization) {
      await tx`
        INSERT INTO control_plane.access_audit_log (
          id, organization_id, actor_id, action, target_type, target_id, request_id, metadata
        ) VALUES (
          ${randomUUID()}, ${input.session.organization.id}, ${input.session.user.id},
          'user_preferences.updated', 'user', ${input.session.user.id}, ${input.requestId ?? null},
          ${JSON.stringify({ fields: Object.keys(patch) })}::jsonb
        )
      `;
    }

    return loadEffectiveRegionalSettings(tx, input.session.user.id, input.session.organization?.id ?? null);
  });
}
