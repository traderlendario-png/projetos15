import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { NextRequest } from 'next/server';
import { POST as devLogin } from '../app/api/auth/dev-login/route';
import { POST as updateLocale } from '../app/api/i18n/locale/route';
import { bootstrapOrganization } from '../lib/control-plane/bootstrap';
import { getControlPlaneConnectionSettings, getMigrationDatabaseUrl } from '../lib/control-plane/config';
import { resolveUserSession } from '../lib/control-plane/sessions';
import { SESSION_COOKIE } from '../lib/control-plane/session-token';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const email = `i18n-probe-${suffix}@example.invalid`;
  const boot = await bootstrapOrganization({
    organization: { name: `I18N Probe ${suffix}`, slug: `i18n-probe-${suffix}` },
    owner: { email, displayName: 'I18N Probe', externalAuthId: `i18n-probe-${suffix}` },
    region: {
      locale: 'pt-BR',
      country: 'BR',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      firstDayOfWeek: 1,
    },
  });

  const settings = getControlPlaneConnectionSettings();
  const ownerSql = postgres(getMigrationDatabaseUrl(), {
    max: 1,
    prepare: false,
    ssl: settings.ssl === 'disable' ? false : settings.ssl,
  });

  try {
    const anonymous = await updateLocale(new NextRequest('http://localhost/api/i18n/locale', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'pt-PT' }),
    }));
    const anonymousBody = await anonymous.json() as { persisted?: boolean };
    assert(anonymous.status === 200, `anonymous locale switch returned ${anonymous.status}`);
    assert(anonymousBody.persisted === false, 'anonymous locale switch must not claim DB persistence');

    const loginForm = new FormData();
    loginForm.set('email', email);
    loginForm.set('displayName', 'I18N Probe');
    loginForm.set('returnTo', '/');
    const login = await devLogin(new NextRequest('http://localhost/api/auth/dev-login', {
      method: 'POST',
      body: loginForm,
    }));
    assert(login.status === 303, `dev login returned ${login.status}`);
    const sessionToken = login.cookies.get(SESSION_COOKIE)?.value;
    assert(sessionToken, 'dev login did not issue a FounderOS session cookie');

    const authenticated = await updateLocale(new NextRequest('http://localhost/api/i18n/locale', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE}=${sessionToken}`,
        'x-request-id': `i18n-live-${suffix}`,
      },
      body: JSON.stringify({ locale: 'es-419' }),
    }));
    const authenticatedBody = await authenticated.json() as { persisted?: boolean; locale?: string };
    assert(authenticated.status === 200, `authenticated locale switch returned ${authenticated.status}`);
    assert(authenticatedBody.persisted === true, 'authenticated locale switch did not persist');
    assert(authenticatedBody.locale === 'es-419', 'locale endpoint returned the wrong locale');

    const rows = await ownerSql<{ locale: string | null }[]>`
      SELECT locale
      FROM control_plane.user_preferences
      WHERE user_id = ${boot.userId}
      LIMIT 1
    `;
    assert(rows[0]?.locale === 'es-419', `database locale mismatch: ${rows[0]?.locale ?? 'missing'}`);

    const resolved = await resolveUserSession(sessionToken);
    assert(resolved?.regional.locale === 'es-419', `resolved session locale mismatch: ${resolved?.regional.locale ?? 'missing'}`);

    console.log(JSON.stringify({
      ok: true,
      anonymousCookieOnly: 'PASS',
      devLoginSessionCookie: 'PASS',
      authenticatedPersistence: 'PASS',
      databasePreference: 'PASS',
      sessionRehydrate: 'PASS',
      locale: resolved.regional.locale,
    }, null, 2));
  } finally {
    try {
      await ownerSql`DELETE FROM control_plane.organizations WHERE id = ${boot.organizationId}`;
      await ownerSql`DELETE FROM control_plane.users WHERE id = ${boot.userId}`;
    } finally {
      await ownerSql.end({ timeout: 5 });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
