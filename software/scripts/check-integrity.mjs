#!/usr/bin/env node
/**
 * Standalone Database Health & Integrity Verification
 * Usage: node scripts/check-integrity.mjs
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../apps/web/data/demo.sqlite');

if (!fs.existsSync(dbPath)) {
  console.error('Database file not found at:', dbPath);
  process.exit(1);
}

const stat = fs.statSync(dbPath);
console.log('--- DATABASE INTEGRITY & HEALTH CHECK ---');
console.log('Database Path:', dbPath);
console.log('Database Size:', `${Math.round(stat.size / 1024)} KB`);
console.log('Last Modified:', stat.mtime.toLocaleString('vi-VN'));

const db = new DatabaseSync(dbPath);

console.log('\n1. Checking SQLite Page Integrity (PRAGMA integrity_check)...');
const integrity = db.prepare('PRAGMA integrity_check').all();
const integrityOk = integrity.length === 1 && integrity[0].integrity_check === 'ok';
if (integrityOk) {
  console.log('   ✓ Page Integrity: OK (No corrupted pages)');
} else {
  console.error('   ✕ Page Integrity: FAILED', integrity);
}

console.log('\n2. Checking Foreign Key Constraints (PRAGMA foreign_key_check)...');
const fk = db.prepare('PRAGMA foreign_key_check').all();
const fkOk = fk.length === 0;
if (fkOk) {
  console.log('   ✓ Foreign Keys: OK (0 violations)');
} else {
  console.error('   ✕ Foreign Keys: FAILED', fk);
}

console.log('\n3. Data Records Summary:');
const tables = [
  'demo_users',
  'demo_leads',
  'demo_ctv',
  'demo_payments',
  'demo_ne_events',
  'demo_followups',
  'demo_lead_activities',
  'demo_lead_documents',
  'demo_lead_owner_assignments',
  'demo_ctv_assignments',
  'demo_import_records',
  'demo_crm_audit'
];

for (const t of tables) {
  try {
    const count = (db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get()).n;
    console.log(`   - ${t.padEnd(28)}: ${count.toLocaleString('vi-VN')} rows`);
  } catch (e) {
    console.log(`   - ${t.padEnd(28)}: [table not present]`);
  }
}

db.close();

if (integrityOk && fkOk) {
  console.log('\n✓ ALL CHECKS PASSED: Database is healthy and ready for operations.\n');
  process.exit(0);
} else {
  console.error('\n✕ HEALTH CHECK FAILED: Review errors above.\n');
  process.exit(1);
}
