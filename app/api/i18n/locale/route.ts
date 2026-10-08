import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestSession } from '@/lib/control-plane/request-auth';
import { updateUserPreferences } from '@/lib/control-plane/preferences';
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from '@/lib/i18n/locales';

const Body = z.object({ locale: z.enum(SUPPORTED_LOCALES) }).strict();

async function persistLocaleForAuthenticatedUser(req: NextRequest, locale: (typeof SUPPORTED_LOCALES)[number]): Promise<boolean> {
  try {
    const session = await getRequestSession();
    if (!session) return false;

    await updateUserPreferences({
      session,
      patch: { locale },
      requestId: req.headers.get('x-request-id') ?? undefined,
    });
    return true;
  } catch (error) {
    // Presentation must remain available even if the optional Control Plane
    // persistence path is unavailable. The cookie is still the immediate
    // source for the next request, while authenticated persistence can retry
    // on the next locale change.
    console.warn('[i18n] locale persisted to cookie but not Control Plane', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  let locale: (typeof SUPPORTED_LOCALES)[number];
  try {
    ({ locale } = Body.parse(await req.json()));
  } catch {
    return NextResponse.json({ error: 'invalid_locale' }, { status: 400 });
  }

  const persisted = await persistLocaleForAuthenticatedUser(req, locale);
  const response = NextResponse.json({ ok: true, locale, persisted });
  response.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
