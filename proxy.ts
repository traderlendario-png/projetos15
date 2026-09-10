import { NextRequest, NextResponse } from 'next/server';
import { challengePage, gateDecision, GATE_COOKIE } from '@/lib/access-gate';
import { SESSION_COOKIE } from '@/lib/control-plane/session-token';
import { resolveUserSession } from '@/lib/control-plane/sessions';
import { isPublicAuthPath, requiredApiPermission } from '@/lib/control-plane/api-policy';
import { DEFAULT_REGIONAL_SETTINGS, LOCALE_COOKIE, negotiateLocale, type RegionalSettings } from '@/lib/i18n/locales';
import { INTERNAL_LOCALE_HEADERS } from '@/lib/i18n/server';

function requestHeaders(req: NextRequest) {
  const headers = new Headers(req.headers);
  // RootLayout uses this trusted, proxy-overwritten value to avoid wrapping
  // /login in the authenticated application shell.
  headers.set('x-founder-pathname', req.nextUrl.pathname);
  if (!headers.get('x-request-id')) headers.set('x-request-id', crypto.randomUUID());
  return headers;
}

function installRegionalHeaders(
  headers: Headers,
  req: NextRequest,
  regional: RegionalSettings = DEFAULT_REGIONAL_SETTINGS,
) {
  // The locale cookie is a presentation preference, never an auth signal.
  // It wins immediately; persistent user/org preference remains the fallback.
  const locale = negotiateLocale({
    cookie: req.cookies.get(LOCALE_COOKIE)?.value,
    preferred: regional.locale,
    acceptLanguage: req.headers.get('accept-language'),
  });
  headers.set(INTERNAL_LOCALE_HEADERS.locale, locale);
  headers.set(INTERNAL_LOCALE_HEADERS.country, regional.country);
  headers.set(INTERNAL_LOCALE_HEADERS.currency, regional.currency);
  headers.set(INTERNAL_LOCALE_HEADERS.timezone, regional.timezone);
  headers.set(INTERNAL_LOCALE_HEADERS.firstDayOfWeek, String(regional.firstDayOfWeek));
}

/**
 * Network boundary. In CONTROL_PLANE_AUTH_MODE=required it resolves the
 * opaque session against PostgreSQL before protected requests pass. API paths
 * also receive a coarse default read/write permission gate here; sensitive
 * actions keep their stricter route-level permission checks.
 *
 * The original one-token demo gate stays available in disabled/optional mode
 * during the staged migration and is not treated as an Enterprise identity.
 */
export async function proxy(req: NextRequest) {
  const authMode = process.env.CONTROL_PLANE_AUTH_MODE ?? 'disabled';
  const headers = requestHeaders(req);
  installRegionalHeaders(headers, req);
  const pathname = req.nextUrl.pathname;

  if (authMode === 'required' && !isPublicAuthPath(pathname)) {
    const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
    const session = sessionToken ? await resolveUserSession(sessionToken) : null;
    if (!session) {
      if (pathname.startsWith('/api/')) {
        const res = NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
        res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
        return res;
      }
      const login = new URL('/login', req.url);
      login.searchParams.set('returnTo', `${pathname}${req.nextUrl.search}`);
      const res = NextResponse.redirect(login);
      if (sessionToken) res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
      return res;
    }

    installRegionalHeaders(headers, req, session.regional);

    if (!pathname.startsWith('/api/') && pathname !== '/accept-invite' && !session.permissions.has('app.read')) {
      return NextResponse.redirect(new URL('/access-pending', req.url));
    }

    const requiredPermission = requiredApiPermission({ pathname, method: req.method });
    if (requiredPermission && !session.permissions.has(requiredPermission)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: `Missing permission: ${requiredPermission}` },
        { status: 403 },
      );
    }

    // Overwrite internal context headers; downstream code must never trust
    // same-named values supplied by the browser/client.
    headers.set('x-founder-authenticated', '1');
    headers.set('x-founder-actor-id', session.user.id);
    if (session.organization) headers.set('x-founder-organization-id', session.organization.id);
    if (session.workspace) headers.set('x-founder-workspace-binding-id', session.workspace.id);
    return NextResponse.next({ request: { headers } });
  }

  if (isPublicAuthPath(pathname)) {
    return NextResponse.next({ request: { headers } });
  }

  const decision = gateDecision({
    token: process.env.FOUNDER_OS_ACCESS_TOKEN,
    cookie: req.cookies.get(GATE_COOKIE)?.value ?? null,
    queryToken: req.nextUrl.searchParams.get('token'),
  });

  switch (decision.kind) {
    case 'open':
    case 'pass':
      return NextResponse.next({ request: { headers } });
    case 'set-cookie': {
      const clean = req.nextUrl.clone();
      clean.searchParams.delete('token');
      const res = NextResponse.redirect(clean);
      res.cookies.set(GATE_COOKIE, decision.value, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.nextUrl.protocol === 'https:',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
      return res;
    }
    case 'challenge':
      return new NextResponse(challengePage(), {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.png$|.*\\.svg$).*)'],
};
