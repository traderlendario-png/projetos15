import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { getControlPlaneConnectionSettings, getMigrationDatabaseUrl } from '../lib/control-plane/config';
import { bootstrapOrganization } from '../lib/control-plane/bootstrap';
import { resolveOrProvisionExternalIdentity } from '../lib/control-plane/identity';
import { createInvitation, acceptInvitation } from '../lib/control-plane/invitations';
import { createUserSession, resolveUserSession } from '../lib/control-plane/sessions';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const ownerEmail = `rbac-owner-${suffix}@example.invalid`;
  const viewerEmail = `rbac-viewer-${suffix}@example.invalid`;
  const owner = await bootstrapOrganization({
    organization: { name: `RBAC Probe ${suffix}`, slug: `rbac-probe-${suffix}` },
    owner: { email: ownerEmail, displayName: 'RBAC Owner', externalAuthId: `probe-owner-${suffix}` },
    region: { locale: 'pt-BR', country: 'BR', currency: 'BRL', timezone: 'America/Sao_Paulo', firstDayOfWeek: 1 },
  });
  const ownerSession = await createUserSession({ userId: owner.userId, organizationId: owner.organizationId, authMethod: 'probe' });
  assert(ownerSession.session.permissions.has('billing.manage'), 'owner must have billing.manage');
  const invitation = await createInvitation({ session: ownerSession.session, email: viewerEmail, roleKey: 'viewer' });
  const viewerIdentity = await resolveOrProvisionExternalIdentity({ provider: 'probe', subject: `probe-viewer-${suffix}`, email: viewerEmail, displayName: 'RBAC Viewer' });
  const viewerAnonymousSession = await createUserSession({ userId: viewerIdentity.userId, authMethod: 'probe' });
  const accepted = await acceptInvitation({ session: viewerAnonymousSession.session, token: invitation.token });
  const viewerSession = await createUserSession({ userId: viewerIdentity.userId, organizationId: accepted.organizationId, authMethod: 'probe' });
  const resolved = await resolveUserSession(viewerSession.token);
  assert(resolved, 'viewer session did not resolve');
  assert(resolved.roleKeys.includes('viewer'), 'viewer role missing');
  assert(resolved.permissions.has('knowledge.read'), 'viewer should read knowledge');
  assert(!resolved.permissions.has('knowledge.write'), 'viewer must not write knowledge');
  assert(!resolved.permissions.has('agents.run'), 'viewer must not run agents');
  assert(!resolved.permissions.has('members.manage'), 'viewer must not manage members');

  const settings = getControlPlaneConnectionSettings();
  const ownerSql = postgres(getMigrationDatabaseUrl(), {
    max: 1, prepare: false, ssl: settings.ssl === 'disable' ? false : settings.ssl,
  });
  try {
    await ownerSql`DELETE FROM control_plane.organizations WHERE id = ${owner.organizationId}`;
    await ownerSql`DELETE FROM control_plane.users WHERE id IN (${owner.userId}, ${viewerIdentity.userId})`;
  } finally {
    await ownerSql.end({ timeout: 5 });
  }
  console.log(JSON.stringify({ ok: true, owner: 'PASS', invitation: 'PASS', viewerReadOnly: 'PASS' }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
