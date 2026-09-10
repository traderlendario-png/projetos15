import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../db/control-plane/0001_foundation.sql', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);
const source = await readFile(migrationPath, 'utf8');
const pkg = JSON.parse(await readFile(packagePath, 'utf8'));

const required = [
  'CREATE SCHEMA IF NOT EXISTS control_plane',
  'control_plane.schema_migrations',
  'control_plane.users',
  'control_plane.organizations',
  'control_plane.memberships',
  'control_plane.workspace_bindings',
  'control_plane.regional_preferences',
  'control_plane.roles',
  'control_plane.permissions',
  'control_plane.subscriptions',
  'ENABLE ROW LEVEL SECURITY',
  'founder_os.organization_id',
  'founder_os.actor_id',
  'engine_tenant_id',
  'engine_workspace_id',
  "'pt-BR', 'pt-PT', 'es-419', 'en-US'",
];

const missing = required.filter((needle) => !source.includes(needle));
if (missing.length) {
  console.error('Control Plane migration is missing required contract markers:');
  for (const marker of missing) console.error(`- ${marker}`);
  process.exit(1);
}

if (pkg.dependencies?.['drizzle-orm'] !== '0.45.2' || pkg.dependencies?.postgres !== '3.4.9') {
  console.error('Control Plane database dependencies are not pinned to the reviewed versions.');
  process.exit(1);
}

const forbiddenCreate = /CREATE\s+TABLE[\s\S]{0,180}\b(rocksdb|derivation_ledger|claims?|facts?|memories?|vectors?)\b/i;
if (forbiddenCreate.test(source)) {
  console.error('Control Plane migration appears to own an OptimalEngine data domain.');
  process.exit(1);
}

const digest = createHash('sha256').update(source).digest('hex');
console.log(JSON.stringify({
  ok: true,
  migration: '0001_foundation.sql',
  sha256: digest,
  database: 'PostgreSQL',
  orm: 'drizzle-orm@0.45.2',
  driver: 'postgres@3.4.9',
  launchLocales: ['pt-BR', 'pt-PT', 'es-419', 'en-US'],
}, null, 2));
