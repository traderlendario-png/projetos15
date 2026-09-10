# FounderOS Human Identity & RBAC

Phase 6 turns the PostgreSQL Control Plane into the canonical source for human
identity, durable sessions and organization authorization. It does **not** move
OptimalEngine knowledge/memory ownership into FounderOS.

## Authentication modes

`CONTROL_PLANE_AUTH_MODE` supports:

- `disabled` — legacy/demo behavior; PostgreSQL human auth is not enforced.
- `optional` — migration mode; session APIs exist but legacy access can continue.
- `required` — protected requests require a valid PostgreSQL-backed session.

Production should use `required`.

## Identity boundary

`control_plane.user_identities` supports multiple external identity providers
per FounderOS user. Provider-specific `subject` values are unique; the legacy
`users.external_auth_id` field remains only for compatibility during migration.

A trusted authentication gateway can exchange an authenticated identity through
`POST /api/auth/exchange`. The body is authenticated with HMAC-SHA256 using:

- `x-founder-timestamp` — Unix seconds
- `x-founder-signature` — HMAC-SHA256 of `<timestamp>.<raw-body>`
- `CONTROL_PLANE_IDENTITY_BRIDGE_SECRET` — server-to-server secret

Requests outside the five-minute skew window are rejected. This bridge is the
Phase 6 provider-neutral boundary; the later Enterprise Identity phase connects
OIDC/SAML/SSO and SCIM without changing session/RBAC semantics.

Local development can enable `CONTROL_PLANE_DEV_AUTH=true`; it is ignored in
`NODE_ENV=production`.

## Session security

Browser cookies carry an opaque random 256-bit token. PostgreSQL stores only its
SHA-256 digest in `user_sessions.token_hash`.

Sessions record:

- user / linked identity
- active organization
- active workspace binding
- authentication method
- expiry / revocation / last-seen time

A database trigger rejects a workspace that does not belong to the session's
active organization and rejects organization selection when the user is not an
active member.

`last_seen_at` is written at most once per five minutes to avoid a database write
on every request.

## Canonical system roles

| Role | Intent |
|---|---|
| Owner | Complete organization access, including billing mutation |
| Admin | Administration and operations; no `billing.manage` |
| Operator | Daily governed operations; cannot administer members/integrations |
| Viewer | Read-only application and audit access |

Two coarse permissions (`app.read`, `app.write`) protect legacy APIs during the
staged SQLite decomposition. Domain-specific permissions remain stricter, e.g.
`agents.run`, `integrations.manage`, `members.manage`, `approvals.decide`.

Role delegation is intentionally asymmetric:

- Owner can assign Owner/Admin/Operator/Viewer.
- Admin can assign Operator/Viewer only.
- Operator/Viewer cannot assign roles.
- The last active Owner cannot be removed or suspended.

## Request enforcement

With auth mode `required`:

1. `proxy.ts` resolves the opaque session in PostgreSQL.
2. Invalid/revoked/expired tokens are rejected and cleared.
3. API routes receive a default read/write permission gate.
4. High-impact routes receive stronger coarse gates at the proxy.
5. Sensitive route handlers call `requireRequestPermission(...)` again.
6. RLS still isolates rows by organization independently of RBAC.

The proxy overwrites internal `x-founder-*` headers so browser-supplied values
cannot impersonate an actor/organization/workspace.

## Invitations and membership administration

`invitations` stores only SHA-256 token hashes. The raw invite token is emitted
once at creation and can later be delivered by the notification/email layer.
Acceptance requires the signed-in user's normalized email to match the invite.

Membership role and status changes are audited. Suspending a member revokes that
user's active sessions for the affected organization.

## Audit

`access_audit_log` is append-only for the application role: it receives SELECT
and INSERT, not UPDATE or DELETE. Current Phase 6 events include invite creation,
invite acceptance, role changes and membership status changes.

OptimalEngine's derivation ledger remains a separate intelligence/governance
ledger. In a later phase, important Control Plane actions will also emit governed
Signals to OptimalEngine.

## Verification gates

Static gate:

```bash
npm run db:rbac:verify
```

Live PostgreSQL gate after migrations:

```bash
npm run db:verify:live
npm run db:rbac:verify:live
```

The live RBAC probe verifies Owner capabilities, invitation acceptance and that
a Viewer can read governed surfaces while being denied write/run/member-management
permissions.
