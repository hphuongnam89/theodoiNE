import { randomUUID } from 'node:crypto';
import pg from 'pg';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const subject = process.env.BOOTSTRAP_ADMIN_SUBJECT?.trim();
if (!process.env.DATABASE_URL || !email || !displayName || !subject) {
  throw new Error('DATABASE_URL and BOOTSTRAP_ADMIN_EMAIL/NAME/SUBJECT are required');
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length > 120 || subject.length > 255) {
  throw new Error('Invalid bootstrap admin fields');
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('ne_crm_admin_users'))");
  const existing = await client.query("SELECT COUNT(*)::integer AS count FROM app_users WHERE role = 'ADMIN' AND is_active = true");
  if (existing.rows[0].count > 0) throw new Error('An active administrator already exists');
  const id = randomUUID();
  await client.query(
    `INSERT INTO app_users (id, email, display_name, role, identity_subject)
     VALUES ($1, $2, $3, 'ADMIN', $4)`,
    [id, email, displayName, subject],
  );
  await client.query(
    `INSERT INTO audit_events (id, actor_user_id, entity_type, entity_id, action, after_data)
     VALUES ($1, NULL, 'app_user', $2, 'BOOTSTRAP_ADMIN', $3::jsonb)`,
    [randomUUID(), id, JSON.stringify({ id, email, display_name: displayName, role: 'ADMIN' })],
  );
  await client.query('COMMIT');
  process.stdout.write(`Administrator initialized: ${id}\n`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
