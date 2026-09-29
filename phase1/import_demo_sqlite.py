"""Import normalized source rows into the local demo review database.

Reads the two XLSX files and prior Phase 1 preview; never modifies the XLSX.
All imported records remain unassigned until an Admin approves owner aliases.
No tuition transaction or official NE event is created.
"""

from __future__ import annotations

import csv
import hashlib
import json
import sqlite3
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

from audit_workbooks import DAILY_FILE, NE_FILE, SOURCES, fold, has_value, phones, source_rows
from dry_run_import import PROGRAM_COLUMNS, TUITION_COLUMNS


ROOT = Path(__file__).resolve().parent.parent
REPORTS = Path(__file__).resolve().parent / "reports"
DB_PATH = ROOT / "software" / "apps" / "web" / "data" / "demo.sqlite"


def cell_text(value: object) -> str | None:
    if not has_value(value):
        return None
    return " ".join(str(value).split())


def source_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_preview() -> dict[tuple[str, int], dict[str, str]]:
    with (REPORTS / "import_preview.csv").open(encoding="utf-8-sig", newline="") as file:
        return {(row["source"], int(row["row"])): row for row in csv.DictReader(file)}


def make_tables(db: sqlite3.Connection) -> None:
    db.executescript("""
      CREATE TABLE IF NOT EXISTS demo_import_batches (
        id TEXT PRIMARY KEY, workbook TEXT NOT NULL UNIQUE,
        sha256 TEXT NOT NULL, imported_at TEXT NOT NULL, row_count INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demo_import_records (
        id TEXT PRIMARY KEY,
        workbook TEXT NOT NULL, source_key TEXT NOT NULL,
        source_sheet TEXT NOT NULL, source_row INTEGER NOT NULL,
        source_sha256 TEXT NOT NULL,
        record_kind TEXT NOT NULL CHECK (record_kind IN ('LEAD','NE_HISTORY')),
        full_name TEXT NOT NULL, name_key TEXT NOT NULL,
        program_raw TEXT, program_key TEXT,
        status_raw TEXT, status_key TEXT,
        owner_raw TEXT, owner_key TEXT,
        ctv_raw TEXT, ctv_key TEXT,
        candidate_group TEXT,
        flags TEXT NOT NULL,
        tuition_positive_unverified INTEGER NOT NULL DEFAULT 0,
        assigned_sales_user_id TEXT REFERENCES demo_users(id),
        assignment_source TEXT,
        reviewed_at TEXT, reviewed_by TEXT REFERENCES demo_users(id),
        imported_at TEXT NOT NULL,
        UNIQUE(workbook, source_sheet, source_row)
      );
      CREATE INDEX IF NOT EXISTS demo_import_owner_key_idx ON demo_import_records(owner_key);
      CREATE INDEX IF NOT EXISTS demo_import_assigned_idx ON demo_import_records(assigned_sales_user_id);
      CREATE INDEX IF NOT EXISTS demo_import_candidate_idx ON demo_import_records(candidate_group);
      CREATE TABLE IF NOT EXISTS demo_import_phones (
        record_id TEXT NOT NULL REFERENCES demo_import_records(id),
        phone_normalized TEXT NOT NULL,
        PRIMARY KEY (record_id, phone_normalized)
      );
      CREATE INDEX IF NOT EXISTS demo_import_phone_idx ON demo_import_phones(phone_normalized);
      CREATE TABLE IF NOT EXISTS demo_ctv_roster_draft (
        id TEXT PRIMARY KEY, workbook TEXT NOT NULL, source_sheet TEXT NOT NULL,
        source_row INTEGER NOT NULL, display_name TEXT NOT NULL, name_key TEXT NOT NULL,
        approved_owner_user_id TEXT REFERENCES demo_users(id),
        UNIQUE(workbook, source_sheet, source_row)
      );
      CREATE TABLE IF NOT EXISTS demo_ctv_phones (
        ctv_id TEXT NOT NULL REFERENCES demo_ctv_roster_draft(id),
        phone_normalized TEXT NOT NULL,
        PRIMARY KEY (ctv_id, phone_normalized)
      );
      CREATE TABLE IF NOT EXISTS demo_owner_alias_approvals (
        owner_key TEXT PRIMARY KEY, approved_sales_user_id TEXT NOT NULL REFERENCES demo_users(id),
        approved_by TEXT NOT NULL REFERENCES demo_users(id), approved_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demo_import_audit (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES demo_users(id),
        owner_key TEXT NOT NULL, sales_user_id TEXT NOT NULL REFERENCES demo_users(id),
        affected_rows INTEGER NOT NULL, occurred_at TEXT NOT NULL
      );
    """)
    columns = {row[1] for row in db.execute("PRAGMA table_info(demo_import_records)")}
    if "assignment_source" not in columns:
        db.execute("ALTER TABLE demo_import_records ADD COLUMN assignment_source TEXT")


def main() -> None:
    profile = json.loads((REPORTS / "source_profile.json").read_text(encoding="utf-8"))
    hashes = {name: source_hash(ROOT / name) for name in (NE_FILE, DAILY_FILE)}
    for name, actual in hashes.items():
        if actual != profile["source_files"][name]["sha256"]:
            raise RuntimeError(f"Source changed since Phase 1 audit: {name}; rerun audit and preview first")
    preview = read_preview()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 10000")
    make_tables(db)
    existing = {row[0]: row[1] for row in db.execute("SELECT workbook, sha256 FROM demo_import_batches")}
    for name, actual in hashes.items():
        if name in existing and existing[name] != actual:
            raise RuntimeError(f"Workbook changed after import: {name}; review diff before replacing data")
    if all(name in existing for name in hashes):
        spec = next(item for item in SOURCES if item.key == "ctv_roster")
        daily = openpyxl.load_workbook(ROOT / DAILY_FILE, data_only=True)
        sheet = daily[spec.sheet]
        for row in source_rows(sheet, spec):
            ctv_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{DAILY_FILE}|{spec.sheet}|{row}"))
            for phone in phones(sheet.cell(row, spec.phone_col).value):
                db.execute("INSERT OR IGNORE INTO demo_ctv_phones (ctv_id, phone_normalized) VALUES (?,?)", (ctv_id, phone))
        db.commit()
        print(json.dumps({"status": "already_imported", "rows": db.execute("SELECT COUNT(*) FROM demo_import_records").fetchone()[0],
                          "ctv_phones": db.execute("SELECT COUNT(*) FROM demo_ctv_phones").fetchone()[0]}, ensure_ascii=False))
        db.close()
        return

    books = {name: openpyxl.load_workbook(ROOT / name, data_only=True) for name in hashes}
    imported_at = datetime.now(timezone.utc).isoformat()
    counts: Counter[str] = Counter()
    phone_rows = 0
    db.execute("BEGIN IMMEDIATE")
    try:
        for spec in SOURCES:
            if spec.key == "ctv_roster" or spec.workbook in existing:
                continue
            sheet = books[spec.workbook][spec.sheet]
            for row in source_rows(sheet, spec):
                profile_row = preview.get((spec.key, row))
                if profile_row is None:
                    raise RuntimeError(f"Missing preview row: {spec.key}:{row}")
                name = cell_text(sheet.cell(row, spec.name_col).value)
                if not name:
                    continue
                program_col = PROGRAM_COLUMNS.get(spec.key)
                program = cell_text(sheet.cell(row, program_col).value) if program_col else None
                owner = cell_text(sheet.cell(row, spec.owner_col).value) if spec.owner_col else None
                ctv = cell_text(sheet.cell(row, spec.ctv_col).value) if spec.ctv_col else None
                status = cell_text(sheet.cell(row, spec.status_col).value) if spec.status_col else None
                amount_col = TUITION_COLUMNS.get(spec.key)
                amount = sheet.cell(row, amount_col).value if amount_col else None
                unverified_tuition = int(isinstance(amount, (int, float)) and not isinstance(amount, bool) and amount > 0)
                record_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{spec.workbook}|{spec.sheet}|{row}"))
                db.execute("""INSERT INTO demo_import_records
                  (id, workbook, source_key, source_sheet, source_row, source_sha256,
                   record_kind, full_name, name_key, program_raw, program_key,
                   status_raw, status_key, owner_raw, owner_key, ctv_raw, ctv_key,
                   candidate_group, flags, tuition_positive_unverified, imported_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (record_id, spec.workbook, spec.key, spec.sheet, row, hashes[spec.workbook],
                   "NE_HISTORY" if spec.key.startswith("ne") else "LEAD",
                   name, fold(name), program, fold(program) if program else None,
                   status, fold(status) if status else None,
                   owner, fold(owner) if owner else None, ctv, fold(ctv) if ctv else None,
                   profile_row["person_candidate_group"], profile_row["flags"], unverified_tuition, imported_at))
                normalized_phones = phones(sheet.cell(row, spec.phone_col).value) if spec.phone_col else set()
                for phone in sorted(normalized_phones):
                    db.execute("INSERT INTO demo_import_phones (record_id, phone_normalized) VALUES (?,?)", (record_id, phone))
                phone_rows += bool(normalized_phones)
                counts[spec.key] += 1
        if DAILY_FILE not in existing:
            spec = next(item for item in SOURCES if item.key == "ctv_roster")
            sheet = books[DAILY_FILE][spec.sheet]
            for row in source_rows(sheet, spec):
                name = cell_text(sheet.cell(row, spec.name_col).value)
                if name:
                    db.execute("""INSERT INTO demo_ctv_roster_draft
                      (id, workbook, source_sheet, source_row, display_name, name_key)
                      VALUES (?,?,?,?,?,?)""",
                      (str(uuid.uuid5(uuid.NAMESPACE_URL, f"{DAILY_FILE}|{spec.sheet}|{row}")),
                       DAILY_FILE, spec.sheet, row, name, fold(name)))
                    ctv_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{DAILY_FILE}|{spec.sheet}|{row}"))
                    for phone in phones(sheet.cell(row, spec.phone_col).value):
                        db.execute("INSERT INTO demo_ctv_phones (ctv_id, phone_normalized) VALUES (?,?)", (ctv_id, phone))
        for name, actual in hashes.items():
            if name not in existing:
                db.execute("INSERT INTO demo_import_batches VALUES (?,?,?,?,?)",
                           (str(uuid.uuid4()), name, actual, imported_at,
                            sum(counts[spec.key] for spec in SOURCES if spec.workbook == name and spec.key != "ctv_roster")))
        if not existing and sum(counts.values()) != len(preview):
            raise RuntimeError("Imported row count differs from Phase 1 preview")
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "imported", "records": sum(counts.values()), "rows_with_phone": phone_rows,
                      "ctv_roster_draft": 31, "by_source": dict(counts),
                      "note": "All rows unassigned; no official NE or KPI created"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
