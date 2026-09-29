import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'demo.sqlite'));
db.exec(`
  CREATE TABLE IF NOT EXISTS demo_users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN','LEADER','SALES')),
    status TEXT NOT NULL CHECK (status IN ('PENDING','ACTIVE','REJECTED')),
    created_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS demo_audit (
    id TEXT PRIMARY KEY, actor_id TEXT, subject_id TEXT,
    action TEXT NOT NULL, occurred_at TEXT NOT NULL
  );
`);
const existing = db.prepare("SELECT COUNT(*) AS count FROM demo_users WHERE role = 'ADMIN' AND status = 'ACTIVE'").get();
if (existing.count > 0) {
  db.close();
  throw new Error('Demo administrator already exists');
}
const email = 'admin@demo.local';
const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16);
const passwordHash = `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
const id = randomUUID();
db.exec('BEGIN IMMEDIATE');
try {
  db.prepare(`INSERT INTO demo_users
    (id, email, display_name, password_hash, role, status, created_at)
    VALUES (?, ?, 'Demo Admin', ?, 'ADMIN', 'ACTIVE', ?)`)
    .run(id, email, passwordHash, new Date().toISOString());
  db.prepare('INSERT INTO demo_audit (id, actor_id, subject_id, action, occurred_at) VALUES (?, NULL, ?, ?, ?)')
    .run(randomUUID(), id, 'BOOTSTRAP_ADMIN', new Date().toISOString());
  db.exec('COMMIT');
  process.stdout.write(`Email: ${email}\nPassword: ${password}\n`);
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}
