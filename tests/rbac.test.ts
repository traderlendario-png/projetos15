import { describe, expect, test } from 'vitest';
import { ROLE_PERMISSION_MATRIX, canAssignSystemRole, permissionsForRoles } from '@/lib/control-plane/rbac';
import { SYSTEM_PERMISSION_KEYS } from '@/lib/control-plane/types';

describe('enterprise RBAC matrix', () => {
  test('owner gets the complete permission catalogue', () => {
    expect(new Set(ROLE_PERMISSION_MATRIX.owner)).toEqual(new Set(SYSTEM_PERMISSION_KEYS));
  });
  test('viewer is read-only', () => {
    const viewer = new Set(ROLE_PERMISSION_MATRIX.viewer);
    for (const mutation of ['app.write', 'organization.manage', 'members.manage', 'workspaces.manage', 'billing.manage', 'settings.manage', 'agents.run', 'agents.manage', 'knowledge.write', 'integrations.manage', 'approvals.decide']) {
      expect(viewer.has(mutation as never)).toBe(false);
    }
  });
  test('admin cannot grant owner/admin, but owner can', () => {
    expect(canAssignSystemRole(['admin'], 'owner')).toBe(false);
    expect(canAssignSystemRole(['admin'], 'admin')).toBe(false);
    expect(canAssignSystemRole(['admin'], 'operator')).toBe(true);
    expect(canAssignSystemRole(['owner'], 'owner')).toBe(true);
  });
  test('multiple roles union permissions', () => {
    expect(permissionsForRoles(['viewer', 'operator']).has('agents.run')).toBe(true);
  });
});
