import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getRequestSession: vi.fn(),
  updateUserPreferences: vi.fn(),
}));

vi.mock('@/lib/control-plane/request-auth', () => ({
  getRequestSession: mocks.getRequestSession,
}));

vi.mock('@/lib/control-plane/preferences', () => ({
  updateUserPreferences: mocks.updateUserPreferences,
}));

import { POST } from '@/app/api/i18n/locale/route';

function request(locale: string) {
  return new NextRequest('http://localhost/api/i18n/locale', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locale }),
  });
}

describe('POST /api/i18n/locale', () => {
  beforeEach(() => {
    mocks.getRequestSession.mockReset();
    mocks.updateUserPreferences.mockReset();
  });

  test('anonymous locale changes stay 200 and use the presentation cookie only', async () => {
    mocks.getRequestSession.mockResolvedValue(null);

    const response = await POST(request('es-419'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, locale: 'es-419', persisted: false });
    expect(response.headers.get('set-cookie')).toContain('founderos.locale=es-419');
    expect(mocks.updateUserPreferences).not.toHaveBeenCalled();
  });

  test('authenticated locale changes persist through user preferences', async () => {
    const session = { user: { id: 'user-1' }, organization: { id: 'org-1' } };
    mocks.getRequestSession.mockResolvedValue(session);
    mocks.updateUserPreferences.mockResolvedValue({ locale: 'pt-PT' });

    const response = await POST(request('pt-PT'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, locale: 'pt-PT', persisted: true });
    expect(mocks.updateUserPreferences).toHaveBeenCalledTimes(1);
    expect(mocks.updateUserPreferences).toHaveBeenCalledWith(expect.objectContaining({
      session,
      patch: { locale: 'pt-PT' },
    }));
  });

  test('a persistence outage never turns presentation locale switching into a 401', async () => {
    mocks.getRequestSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.updateUserPreferences.mockRejectedValue(new Error('db unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await POST(request('en-US'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, locale: 'en-US', persisted: false });
    expect(response.headers.get('set-cookie')).toContain('founderos.locale=en-US');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('invalid locale remains a 400 validation error', async () => {
    const response = await POST(request('fr-FR'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_locale' });
  });
});
