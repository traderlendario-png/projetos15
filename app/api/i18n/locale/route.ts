import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from '@/lib/i18n/locales';

const Body = z.object({ locale: z.enum(SUPPORTED_LOCALES) }).strict();

export async function POST(req: NextRequest) {
  try {
    const { locale } = Body.parse(await req.json());
    const response = NextResponse.json({ ok: true, locale });
    response.cookies.set(LOCALE_COOKIE, locale, {
      httpOnly: false,
      sameSite: 'lax',
      secure: req.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'invalid_locale' }, { status: 400 });
  }
}
