import { z } from 'zod';

export const ControlPlaneAuthModeSchema = z.enum(['disabled', 'optional', 'required']);
export type ControlPlaneAuthMode = z.infer<typeof ControlPlaneAuthModeSchema>;

export function getControlPlaneAuthMode(env: NodeJS.ProcessEnv = process.env): ControlPlaneAuthMode {
  return ControlPlaneAuthModeSchema.parse(env.CONTROL_PLANE_AUTH_MODE ?? 'disabled');
}

export function isDevAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.CONTROL_PLANE_DEV_AUTH === 'true';
}

export function getSessionCookieSecure(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CONTROL_PLANE_COOKIE_SECURE === 'false') return false;
  if (env.CONTROL_PLANE_COOKIE_SECURE === 'true') return true;
  return env.NODE_ENV === 'production';
}
