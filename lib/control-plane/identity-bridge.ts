import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const IdentityExchangeSchema = z.object({
  provider: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9._:-]*$/),
  subject: z.string().trim().min(1).max(255),
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(160),
  organizationId: z.string().uuid().nullable().optional(),
  remember: z.boolean().optional().default(false),
  returnTo: z.string().optional(),
});
export type IdentityExchange = z.infer<typeof IdentityExchangeSchema>;

export function signIdentityBridgeBody(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
}

export function verifyIdentityBridgeRequest(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowMs?: number;
  maxSkewSeconds?: number;
}): boolean {
  if (!input.secret || !input.timestamp || !input.signature) return false;
  const timestampMs = Number(input.timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) return false;
  const skew = Math.abs((input.nowMs ?? Date.now()) - timestampMs);
  if (skew > (input.maxSkewSeconds ?? 300) * 1000) return false;
  const expected = signIdentityBridgeBody(input.secret, input.timestamp, input.body);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(input.signature, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (value.includes('\\')) return '/';
  return value;
}
