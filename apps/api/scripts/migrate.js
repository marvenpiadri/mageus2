import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';

if (!pool) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../migrations');
const client = await pool.connect();
const lockName = 'mageus2:schema-migrations';

try {
  // Prevent two deploys from applying the same migration concurrently.
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockName]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');

  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of names) {
    const sql = await readFile(resolve(migrationsDir, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const applied = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);

    if (applied.rowCount) {
      const storedChecksum = applied.rows[0].checksum;
      if (storedChecksum && storedChecksum !== checksum) {
        throw new Error(`Applied migration ${name} has changed. Add a new migration instead of editing a migration that has been applied.`);
      }
      if (!storedChecksum) {
        // Adopt existing migration records once; older versions of this runner did not store checksums.
        await client.query('UPDATE schema_migrations SET checksum = $2 WHERE name = $1', [name, checksum]);
      }
      continue;
    }

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
      await client.query('COMMIT');
      console.info(`Applied migration: ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  try { await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]); } catch { /* connection may already be unusable */ }
  client.release();
  await pool.end();
}
