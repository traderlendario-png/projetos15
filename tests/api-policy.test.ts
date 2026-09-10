import { describe, expect, test } from 'vitest';
import { isPublicAuthPath, requiredApiPermission } from '@/lib/control-plane/api-policy';

describe('API authorization policy', () => {
  test('login and identity exchange stay reachable before a session exists', () => {
    expect(isPublicAuthPath('/login')).toBe(true);
    expect(isPublicAuthPath('/api/auth/exchange')).toBe(true);
    expect(isPublicAuthPath('/api/i18n/locale')).toBe(true);
    expect(isPublicAuthPath('/api/agents')).toBe(false);
  });
  test('legacy reads/writes have safe defaults', () => {
    expect(requiredApiPermission({ pathname: '/api/metrics', method: 'GET' })).toBe('app.read');
    expect(requiredApiPermission({ pathname: '/api/social/posts', method: 'POST' })).toBe('app.write');
  });

  test('personal presentation preferences rely on authenticated self-RLS, not app.write', () => {
    expect(requiredApiPermission({ pathname: '/api/control-plane/me/preferences', method: 'GET' })).toBeNull();
    expect(requiredApiPermission({ pathname: '/api/control-plane/me/preferences', method: 'PATCH' })).toBeNull();
  });
  test('high-impact actions receive stricter permissions', () => {
    expect(requiredApiPermission({ pathname: '/api/agents/analyst/run', method: 'POST' })).toBe('agents.run');
    expect(requiredApiPermission({ pathname: '/api/connections/connect', method: 'POST' })).toBe('integrations.manage');
    expect(requiredApiPermission({ pathname: '/api/control-plane/invitations', method: 'POST' })).toBe('members.manage');
  });
});
