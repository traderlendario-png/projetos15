import { NextResponse } from 'next/server';
import { requireRequestPermission, authorizationErrorResponse } from '@/lib/control-plane/request-auth';
import { getControlPlaneConnection } from '@/lib/control-plane/client';
import { withControlPlaneScope } from '@/lib/control-plane/scope';

export async function GET() {
  try {
    const session = await requireRequestPermission('members.read');
    const organizationId = session.organization!.id;
    const { sql } = getControlPlaneConnection();
    const members = await withControlPlaneScope(
      { organizationId, actorId: session.user.id },
      async (tx) => tx<{
        membership_id: string;
        user_id: string;
        email: string;
        display_name: string;
        status: string;
        joined_at: Date | null;
        roles: string[] | null;
      }[]>`
        SELECT
          m.id AS membership_id,
          u.id AS user_id,
          u.email,
          u.display_name,
          m.status,
          m.joined_at,
          array_remove(array_agg(DISTINCT r.key), NULL) AS roles
        FROM control_plane.memberships m
        JOIN control_plane.users u ON u.id = m.user_id
        LEFT JOIN control_plane.membership_roles mr
          ON mr.membership_id = m.id AND mr.organization_id = m.organization_id
        LEFT JOIN control_plane.roles r
          ON r.id = mr.role_id AND r.organization_id = mr.organization_id
        WHERE m.organization_id = ${organizationId}
        GROUP BY m.id, u.id, u.email, u.display_name, m.status, m.joined_at
        ORDER BY u.display_name, u.email
      `,
    );
    return NextResponse.json({ members });
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
