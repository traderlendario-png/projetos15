import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { ROLE_PERMISSION_MATRIX, SYSTEM_ROLE_KEYS } from './rbac';

const ROLE_LABELS = {
  owner: ['Owner', 'Organization owner; unrestricted Control Plane access'],
  admin: ['Admin', 'Administration without ownership/billing mutation'],
  operator: ['Operator', 'Day-to-day operational access with governed actions'],
  viewer: ['Viewer', 'Read-only business and audit access'],
} as const;

export async function provisionSystemRoles(tx: postgres.TransactionSql, organizationId: string) {
  const ids: Record<string, string> = {};
  for (const key of SYSTEM_ROLE_KEYS) {
    const [name, description] = ROLE_LABELS[key];
    const rows = await tx<{ id: string }[]>`
      INSERT INTO control_plane.roles (
        id, organization_id, key, name, description, is_system
      ) VALUES (
        ${randomUUID()}, ${organizationId}, ${key}, ${name}, ${description}, true
      )
      ON CONFLICT (organization_id, key) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, is_system = true
      RETURNING id
    `;
    const roleId = rows[0].id;
    ids[key] = roleId;
    for (const permission of ROLE_PERMISSION_MATRIX[key]) {
      await tx`
        INSERT INTO control_plane.role_permissions (organization_id, role_id, permission_key)
        VALUES (${organizationId}, ${roleId}, ${permission})
        ON CONFLICT DO NOTHING
      `;
    }
  }
  return ids as Record<(typeof SYSTEM_ROLE_KEYS)[number], string>;
}
