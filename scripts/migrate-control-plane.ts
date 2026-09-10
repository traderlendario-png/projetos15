import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { getControlPlaneConnectionSettings, getMigrationDatabaseUrl } from '../lib/control-plane/config';

function checksum(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

async function main() {
  const config = getControlPlaneConnectionSettings();
  const migrationUrl = getMigrationDatabaseUrl();
  const sql = postgres(migrationUrl, {
    max: 1,
    connect_timeout: config.connectTimeoutSeconds,
    idle_timeout: config.idleTimeoutSeconds,
    ssl: config.ssl === 'disable' ? false : config.ssl,
    prepare: false,
  });

  const migrationsDir = path.resolve(process.cwd(), 'db', 'control-plane');
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  try {
    await sql.unsafe(`
      CREATE SCHEMA IF NOT EXISTS control_plane;
      CREATE TABLE IF NOT EXISTS control_plane.schema_migrations (
        name text PRIMARY KEY,
        checksum_sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    for (const file of files) {
      const source = await readFile(path.join(migrationsDir, file), 'utf8');
      const digest = checksum(source);

      const existing = await sql<{ checksum_sha256: string }[]>`
        SELECT checksum_sha256
        FROM control_plane.schema_migrations
        WHERE name = ${file}
      `;

      if (existing.length > 0) {
        if (existing[0].checksum_sha256 !== digest) {
          throw new Error(`Migration checksum mismatch: ${file}`);
        }
        console.log(`skip ${file}`);
        continue;
      }

      await sql.begin(async (tx) => {
        await tx.unsafe(source);
        await tx`
          INSERT INTO control_plane.schema_migrations (name, checksum_sha256)
          VALUES (${file}, ${digest})
        `;
      });
      console.log(`applied ${file}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
