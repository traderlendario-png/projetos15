import { describe, expect, test } from 'vitest';
import { safeReturnTo, signIdentityBridgeBody, verifyIdentityBridgeRequest } from '@/lib/control-plane/identity-bridge';

describe('identity bridge HMAC', () => {
  test('accepts a fresh exact signature and rejects tampering', () => {
    const secret = 'test-secret';
    const timestamp = '1788990000';
    const body = '{"subject":"abc"}';
    const signature = signIdentityBridgeBody(secret, timestamp, body);
    expect(verifyIdentityBridgeRequest({ secret, timestamp, signature, body, nowMs: 1788990000000 })).toBe(true);
    expect(verifyIdentityBridgeRequest({ secret, timestamp, signature, body: body + 'x', nowMs: 1788990000000 })).toBe(false);
  });
  test('rejects stale requests', () => {
    const secret = 'test-secret';
    const timestamp = '1788990000';
    const body = '{}';
    const signature = signIdentityBridgeBody(secret, timestamp, body);
    expect(verifyIdentityBridgeRequest({ secret, timestamp, signature, body, nowMs: 1788991000000 })).toBe(false);
  });
  test('returnTo never becomes an open redirect', () => {
    expect(safeReturnTo('/agents')).toBe('/agents');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo('//evil.example')).toBe('/');
  });
});
