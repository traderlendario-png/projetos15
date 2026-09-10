import { randomUUID } from 'node:crypto';
import { getControlPlaneConnection } from './client';
import { normalizeEmail } from './types';

export type ExternalIdentityInput = {
  provider: string;
  subject: string;
  email: string;
  displayName: string;
  metadata?: Record<string, unknown>;
};

export type ResolvedIdentity = {
  identityId: string;
  userId: string;
  email: string;
  displayName: string;
};

function assertIdentityPart(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255) throw new Error(`Invalid identity ${label}`);
  return normalized;
}

export async function resolveOrProvisionExternalIdentity(
  input: ExternalIdentityInput,
): Promise<ResolvedIdentity> {
  const provider = assertIdentityPart(input.provider, 'provider').toLowerCase();
  const subject = assertIdentityPart(input.subject, 'subject');
  const email = input.email.trim();
  const emailNormalized = normalizeEmail(email);
  const displayName = input.displayName.trim() || emailNormalized;
  const legacyAuthId = `${provider}:${subject}`;
  const { sql } = getControlPlaneConnection();

  return sql.begin(async (tx) => {
    await tx`select set_config('founder_os.identity_provider', ${provider}, true)`;
    await tx`select set_config('founder_os.identity_subject', ${subject}, true)`;
    await tx`select set_config('founder_os.bootstrap_email', ${emailNormalized}, true)`;

    const linked = await tx<{ identity_id: string; user_id: string }[]>`
      SELECT id AS identity_id, user_id
      FROM control_plane.user_identities
      WHERE provider = ${provider} AND subject = ${subject}
      LIMIT 1
    `;

    if (linked[0]) {
      await tx`select set_config('founder_os.actor_id', ${linked[0].user_id}, true)`;
      const users = await tx<{ email: string }[]>`
        SELECT email FROM control_plane.users WHERE id = ${linked[0].user_id} LIMIT 1
      `;
      if (!users[0]) throw new Error('Linked identity user is unavailable');
      await tx`
        UPDATE control_plane.user_identities
        SET last_seen_at = now(), email_at_link = ${email}
        WHERE id = ${linked[0].identity_id}
      `;
      await tx`
        UPDATE control_plane.users
        SET display_name = ${displayName}, status = 'active'
        WHERE id = ${linked[0].user_id}
      `;
      return {
        identityId: linked[0].identity_id,
        userId: linked[0].user_id,
        email: users[0].email,
        displayName,
      };
    }

    const proposedUserId = randomUUID();
    const users = await tx<{ id: string }[]>`
      INSERT INTO control_plane.users (
        id, external_auth_id, email, email_normalized, display_name, status
      ) VALUES (
        ${proposedUserId}, ${legacyAuthId}, ${email}, ${emailNormalized}, ${displayName}, 'active'
      )
      ON CONFLICT (email_normalized) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        external_auth_id = COALESCE(control_plane.users.external_auth_id, EXCLUDED.external_auth_id),
        status = 'active'
      RETURNING id
    `;
    const userId = users[0].id;
    await tx`select set_config('founder_os.actor_id', ${userId}, true)`;

    const identityId = randomUUID();
    await tx`
      INSERT INTO control_plane.user_identities (
        id, user_id, provider, subject, email_at_link, metadata
      ) VALUES (
        ${identityId}, ${userId}, ${provider}, ${subject}, ${email},
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
    `;

    return { identityId, userId, email, displayName };
  });
}
