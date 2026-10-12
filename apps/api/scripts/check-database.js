import { pool } from '../src/db/pool.js';

if (!pool) {
  console.error('DATABASE_URL is required. Set it in the API server environment; do not put it in frontend configuration or commit it.');
  process.exit(1);
}

try {
  const result = await pool.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      current_setting('server_version') AS server_version,
      current_setting('transaction_read_only') AS transaction_read_only
  `);
  const row = result.rows[0];
  console.info('Mageus database connection succeeded.');
  console.info(JSON.stringify({
    database: row.database_name,
    user: row.database_user,
    serverVersion: row.server_version,
    readOnly: row.transaction_read_only === 'on'
  }, null, 2));
} catch (error) {
  console.error('Mageus database connection failed.');
  console.error('Check DATABASE_URL, Neon project status, network access, and that the password has not been rotated.');
  console.error(`Database error code: ${error?.code ?? 'unknown'}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
