import 'server-only';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { cookies } from 'next/headers';

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = 'ne_demo_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export type DemoRole = 'ADMIN' | 'LEADER' | 'SALES';
export type DemoStatus = 'PENDING' | 'ACTIVE' | 'REJECTED';
export type DemoUser = {
  id: string; email: string; display_name: string;
  role: DemoRole; status: DemoStatus; created_at: string;
};

let database: DatabaseSync | undefined;

export function getDemoDb(): DatabaseSync {
  if (database) return database;
  const dataDir = path.join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  database = new DatabaseSync(path.join(dataDir, 'demo.sqlite'));
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS demo_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN','LEADER','SALES')),
      status TEXT NOT NULL CHECK (status IN ('PENDING','ACTIVE','REJECTED')),
      created_at TEXT NOT NULL,
      approved_by TEXT REFERENCES demo_users(id),
      approved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS demo_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES demo_users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS demo_sessions_user_idx ON demo_sessions(user_id);
    CREATE TABLE IF NOT EXISTS demo_auth_attempts (
      email TEXT PRIMARY KEY COLLATE NOCASE,
      failed_count INTEGER NOT NULL,
      locked_until TEXT
    );
    CREATE TABLE IF NOT EXISTS demo_audit (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES demo_users(id),
      subject_id TEXT REFERENCES demo_users(id),
      action TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
  `);
  return database;
}

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
  return timingSafeEqual(actual, expected);
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  getDemoDb().prepare(
    'INSERT INTO demo_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(tokenHash(token), userId, new Date(now.getTime() + SESSION_MS).toISOString(), now.toISOString());
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.DEMO_HTTPS === 'true',
    path: '/', maxAge: SESSION_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<DemoUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const row = getDemoDb().prepare(`
    SELECT u.id, u.email, u.display_name, u.role, u.status, u.created_at
    FROM demo_sessions s JOIN demo_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenHash(token), new Date().toISOString()) as DemoUser | undefined;
  return row ?? null;
}

export async function destroySession(): Promise<void> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token) getDemoDb().prepare('DELETE FROM demo_sessions WHERE token_hash = ?').run(tokenHash(token));
  await clearSessionCookie();
}

export function addAudit(actorId: string | null, subjectId: string, action: string): void {
  getDemoDb().prepare(
    'INSERT INTO demo_audit (id, actor_id, subject_id, action, occurred_at) VALUES (?, ?, ?, ?, ?)',
  ).run(randomUUID(), actorId, subjectId, action, new Date().toISOString());
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}
