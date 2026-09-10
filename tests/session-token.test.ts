import { describe, expect, test } from 'vitest';
import { createOpaqueSessionToken, hashOpaqueToken } from '@/lib/control-plane/session-token';

describe('opaque sessions', () => {
  test('stores only a stable SHA-256 representation', () => {
    const token = createOpaqueSessionToken();
    const hash = hashOpaqueToken(token);
    expect(token).not.toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOpaqueToken(token)).toBe(hash);
  });
  test('tokens carry enough entropy and are URL-safe', () => {
    const token = createOpaqueSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
