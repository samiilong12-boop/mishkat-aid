#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
أداة ترحيل قاعدة بيانات برنامج Python المحلي القديم (SQLite) إلى حزمة استيراد منصة سند الهجينة
Usage:
    python scripts/migrate_legacy_sqlite_to_sanad.py <legacy_db.sqlite> [output_sanad_migration.json]
"""

import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


def export_sqlite_to_sanad_json(sqlite_path: str, output_json_path: str) -> None:
    db_file = Path(sqlite_path)
    if not db_file.exists():
        raise FileNotFoundError(f"لم يتم العثور على ملف قاعدة البيانات: {sqlite_path}")

    conn = sqlite3.connect(str(db_file))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row["name"] for row in cursor.fetchall()}

    cases_table = "beneficiary_cases" if "beneficiary_cases" in tables else ("cases" if "cases" in tables else None)
    if not cases_table:
        raise ValueError("لم يتم العثور على جدول الحالات (beneficiary_cases أو cases) داخل قاعدة SQLite.")

    cursor.execute(f"SELECT * FROM {cases_table}")
    raw_cases = [dict(row) for row in cursor.fetchall()]

    followups = []
    if "followups" in tables:
        cursor.execute("SELECT * FROM followups")
        followups = [dict(row) for row in cursor.fetchall()]

    bundle = {
        "source": "Legacy Python SQLite Aid Manager",
        "exported_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "beneficiary_cases": raw_cases,
        "followups": followups,
    }

    out_path = Path(output_json_path)
    out_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    conn.close()
    print(f"✓ تم استخراج {len(raw_cases)} حالة و {len(followups)} متابعة بنجاح إلى: {out_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("الاستخدام: python scripts/migrate_legacy_sqlite_to_sanad.py <legacy_db.sqlite> [output.json]")
        sys.exit(1)

    in_db = sys.argv[1]
    out_json = sys.argv[2] if len(sys.argv) >= 3 else "sanad_sqlite_migration.json"
    export_sqlite_to_sanad_json(in_db, out_json)
