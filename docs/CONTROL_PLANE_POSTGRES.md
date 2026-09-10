# FounderOS PostgreSQL Control Plane

## Ownership boundary

PostgreSQL owns **human/product SaaS state**: users, organizations, memberships,
roles, permissions, regional preferences, plan/subscription state, and bindings
to OptimalEngine workspaces.

OptimalEngine remains the source of truth for governed knowledge, ingestion,
RAG, graph state, claims, facts, memory, derivation ledger, and its own tenant /
organization / workspace isolation. `workspace_bindings` stores identifiers only;
it does not mirror OptimalEngine knowledge data.

The legacy FounderOS SQLite database remains enabled during the staged migration
for existing demo/product-domain tables. It will be decomposed deliberately
rather than replaced in a single risky cutover.

## Local setup

1. Start PostgreSQL 18 (or another supported PostgreSQL release).
2. Create a database and a dedicated migration owner.
3. Set `DATABASE_URL` for the non-owner application role.
4. Set `DATABASE_MIGRATION_URL` for the migration owner when the two roles are separated.
5. Run `npm run db:migrate`.
6. Set the bootstrap variables in `.env.local` and run `npm run db:bootstrap` once.
7. Check `GET /api/control-plane/health`.

## RLS contract

Tenant-scoped tables have PostgreSQL Row Level Security enabled. Application
queries should run inside `withControlPlaneScope`, which installs transaction-
local values:

- `founder_os.organization_id`
- `founder_os.actor_id`
- `founder_os.request_id`

`set_config(..., true)` gives SET LOCAL behavior, preventing scope leakage when
pooled database connections are reused.

**Production requirement:** the app role must not own the Control Plane tables.
PostgreSQL table owners can bypass ordinary RLS. Use a separate migration owner
and application role; do not grant `BYPASSRLS` to the app role.

## Workspace contract

A workspace binding maps the web/control-plane organization to the existing
OptimalEngine scope:

```text
FounderOS organization
  -> engine_tenant_id
  -> engine_organization_id (optional)
  -> engine_workspace_id
```

This is intentionally a reference boundary, not a duplicated workspace store.

## Launch locales

The first regional contract is:

- `pt-BR` — Português (Brasil)
- `pt-PT` — Português (Portugal)
- `es-419` — Español (Latinoamérica)
- `en-US` — English (United States)

Locale, country, currency, and timezone are stored separately. A Brazilian
organization may use `en-US` with `USD`, for example.

## Gate PostgreSQL vivo

`npm run db:verify:live` é o teste de promoção da fundação multi-tenant. Ele exige `DATABASE_URL` apontando para a role de aplicação não-owner e `DATABASE_MIGRATION_URL` apontando para a role owner/migration. O probe valida que a role da aplicação não é superuser, não possui `BYPASSRLS`, não é dona das tabelas, enxerga somente sua organização/usuário e recebe bloqueio de RLS ao tentar escrever em outra organização. Os dois tenants de probe usam UUIDs exclusivos e são removidos no `finally`.

Execute depois de `npm run db:migrate`. Este gate deve passar antes de qualquer promoção do PostgreSQL Control Plane para produção.

## Phase 6 — Human identity and RBAC

The Control Plane now also owns external identity links, opaque sessions, invitations and access-audit events. Sessions keep only SHA-256 token digests at rest and bind the current human actor to one active organization/workspace. Canonical roles are `owner`, `admin`, `operator`, and `viewer`; `app.read/app.write` protect legacy APIs during staged SQLite decomposition while domain permissions remain stricter. See `docs/CONTROL_PLANE_AUTH_RBAC.md`.

For production set `CONTROL_PLANE_AUTH_MODE=required`; the request proxy resolves the PostgreSQL session before protected traffic passes. RLS continues to provide tenant isolation independently of application RBAC.
