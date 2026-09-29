#!/usr/bin/env node
/**
 * Standalone Database Backup Utility
 * Usage: node scripts/backup-db.mjs
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../apps/web/data/demo.sqlite');
const backupsDir = path.resolve(__dirname, '../apps/web/data/backups');

fs.mkdirSync(backupsDir, { recursive: true });

if (!fs.existsSync(dbPath)) {
  console.error('Database file not found at:', dbPath);
  process.exit(1);
}

console.log('Initiating database backup from:', dbPath);

const db = new DatabaseSync(dbPath);
console.log('1. Flushing WAL frames to main database...');
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();

const now = new Date();
const timestampStr = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const backupFilename = `demo-backup-${timestampStr}.sqlite`;
const backupPath = path.join(backupsDir, backupFilename);

console.log('2. Copying database file to snapshot...');
fs.copyFileSync(dbPath, backupPath);

const stat = fs.statSync(backupPath);
console.log(`3. Validating snapshot integrity (${Math.round(stat.size / 1024)} KB)...`);

const backupDb = new DatabaseSync(backupPath);
const integrity = backupDb.prepare('PRAGMA integrity_check').all();
const fk = backupDb.prepare('PRAGMA foreign_key_check').all();
backupDb.close();

if (integrity.length === 1 && integrity[0].integrity_check === 'ok' && fk.length === 0) {
  console.log('✓ Backup successful and validated!');
  console.log('  File:', backupPath);
  console.log('  Size:', `${Math.round(stat.size / 1024)} KB`);
  console.log('  Time:', now.toLocaleString('vi-VN'));
} else {
  console.error('✕ Backup validation failed:', { integrity, fk });
  process.exit(1);
}
