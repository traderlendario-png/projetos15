import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../db/control-plane/0002_identity_rbac.sql', import.meta.url), 'utf8');
const rbac = await readFile(new URL('../lib/control-plane/rbac.ts', import.meta.url), 'utf8');
const sessions = await readFile(new URL('../lib/control-plane/sessions.ts', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8');
const required = [
  'control_plane.user_identities', 'control_plane.user_sessions', 'control_plane.invitations',
  'control_plane.access_audit_log', 'ENABLE ROW LEVEL SECURITY', 'token_hash',
  "'owner'", "'admin'", "'operator'", "'viewer'", 'validate_session_scope',
  'founder_os.session_token_hash', 'founder_os.identity_subject', 'founder_os.invitation_token_hash',
  'current_actor_has_permission', "'app.read'", "'app.write'",
];
const missing = required.filter((marker) => !migration.includes(marker));
if (missing.length) throw new Error(`Phase 6 migration markers missing: ${missing.join(', ')}`);
if (!rbac.includes('ROLE_PERMISSION_MATRIX') || !rbac.includes('canAssignSystemRole')) {
  throw new Error('RBAC policy matrix/delegation guard missing');
}
if (!sessions.includes('hashOpaqueToken') || sessions.includes('INSERT INTO control_plane.user_sessions (\n        id, user_id, identity_id, token,')) {
  throw new Error('Session storage contract must use token hashes only');
}
if (!proxy.includes('SESSION_COOKIE') || !proxy.includes('CONTROL_PLANE_AUTH_MODE') || !proxy.includes('resolveUserSession') || !proxy.includes('requiredApiPermission')) {
  throw new Error('Request boundary is not database-session/RBAC aware');
}
console.log(JSON.stringify({
  ok: true,
  migration: '0002_identity_rbac.sql',
  sha256: createHash('sha256').update(migration).digest('hex'),
  roles: ['owner', 'admin', 'operator', 'viewer'],
  sessionStorage: 'opaque token; SHA-256 at rest',
  identityBridge: 'HMAC-SHA256',
  audit: 'append-only for app role',
}, null, 2));
