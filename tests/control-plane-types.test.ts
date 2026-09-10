import { describe, expect, test } from 'vitest';
import {
  BootstrapOrganizationInputSchema,
  DEFAULT_REGION_PREFERENCES,
  RegionPreferencesSchema,
  SupportedLocaleSchema,
  normalizeEmail,
} from '@/lib/control-plane/types';

describe('Control Plane regional contract', () => {
  test('ships the four launch locales', () => {
    expect(SupportedLocaleSchema.options).toEqual(['pt-BR', 'pt-PT', 'es-419', 'en-US']);
  });

  test('defaults Brazil without coupling locale to currency at runtime', () => {
    expect(DEFAULT_REGION_PREFERENCES).toEqual({
      locale: 'pt-BR',
      country: 'BR',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      firstDayOfWeek: 1,
    });

    expect(
      RegionPreferencesSchema.parse({
        locale: 'en-US',
        country: 'BR',
        currency: 'USD',
        timezone: 'America/Sao_Paulo',
        firstDayOfWeek: 1,
      }),
    ).toMatchObject({ locale: 'en-US', currency: 'USD' });
  });

  test('rejects invalid IANA timezone identifiers', () => {
    expect(() =>
      RegionPreferencesSchema.parse({
        locale: 'en-US',
        country: 'BR',
        currency: 'BRL',
        timezone: 'not/a-zone',
        firstDayOfWeek: 1,
      }),
    ).toThrow();
  });

});

describe('Control Plane bootstrap input', () => {
  test('normalizes email deterministically', () => {
    expect(normalizeEmail('  Founder@Example.COM ')).toBe('founder@example.com');
  });

  test('accepts an OptimalEngine workspace binding without owning OE storage', () => {
    const parsed = BootstrapOrganizationInputSchema.parse({
      organization: { name: 'Acme Brasil', slug: 'acme-brasil' },
      owner: { email: 'founder@example.com', displayName: 'Founder' },
      optimalEngine: {
        tenantId: 'tenant-acme',
        organizationId: 'org-acme',
        workspaceId: 'workspace-main',
      },
    });

    expect(parsed.optimalEngine?.workspaceSlug).toBe('principal');
    expect(parsed.region.locale).toBe('pt-BR');
  });

  test('rejects invalid tenant slugs and malformed region codes', () => {
    expect(() =>
      BootstrapOrganizationInputSchema.parse({
        organization: { name: 'Acme', slug: 'Acme Brasil' },
        owner: { email: 'founder@example.com', displayName: 'Founder' },
      }),
    ).toThrow();

    expect(() =>
      RegionPreferencesSchema.parse({
        locale: 'es-419',
        country: 'mex',
        currency: 'peso',
        timezone: 'America/Mexico_City',
        firstDayOfWeek: 1,
      }),
    ).toThrow();
  });
});
