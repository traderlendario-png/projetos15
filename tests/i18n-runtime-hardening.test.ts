import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Phase 7B i18n/runtime hardening contracts', () => {
  test('locale switching is one public request with optional authenticated persistence', () => {
    const switcher = read('components/i18n/LocaleSwitcher.tsx');
    expect(switcher).toContain("fetch('/api/i18n/locale'");
    expect(switcher).not.toContain('/api/control-plane/me/preferences');

    const route = read('app/api/i18n/locale/route.ts');
    expect(route).toContain('getRequestSession');
    expect(route).toContain('updateUserPreferences');
    expect(route).toContain('persisted');
    expect(route).toContain("patch: { locale }");
  });

  test('locale-sensitive visualizations do not fall back to the launch default', () => {
    const social = read('components/HomeSocialGraph.tsx');
    expect(social).not.toContain('DEFAULT_LOCALE');
    expect(social).not.toContain("from '@/lib/i18n/format'");
    expect(social.match(/const \{ number \} = useI18n\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(2);

    const calendar = read('components/WeekCalendar.tsx');
    expect(calendar).not.toContain('DEFAULT_LOCALE');
    expect(calendar).not.toContain('DEFAULT_REGIONAL_SETTINGS');
    expect(calendar).not.toContain("from '@/lib/i18n/format'");
    expect(calendar).toMatch(/function EventBlock[\s\S]*const \{ date \} = useI18n\(\);/);
  });

  test('Postgres scope keeps generic values typed and Turbopack has an explicit absolute root', () => {
    const scope = read('lib/control-plane/scope.ts');
    expect(scope).not.toMatch(/\bas any\b|\btx:\s*any\b/);
    expect(scope).toContain('return { value: await fn(tx) };');
    expect(scope).toContain('return result.value;');

    const config = read('next.config.mjs');
    expect(config).toContain('fileURLToPath(import.meta.url)');
    expect(config).toContain('root: projectRoot');
  });
});
