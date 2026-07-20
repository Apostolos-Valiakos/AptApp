#!/usr/bin/env python3
"""
One-time import script: Excel appointments → PostgreSQL.

Import order:
  1. Distinct new services  → services table
  2. Distinct new clients   → clients table
  3. Appointments           → appointments table
  4. Appointment services   → appointment_services table

Usage:
    python import_appointments.py appointments.xlsx           # dry-run (default)
    python import_appointments.py appointments.xlsx --commit  # actually insert
"""

import sys
import os
import uuid
import argparse
import unicodedata
from datetime import datetime

import psycopg2
import psycopg2.extras
import pandas as pd
from rapidfuzz import process, fuzz
from dotenv import load_dotenv

# ── Config ─────────────────────────────────────────────────────────────────────

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
DB_URI = os.environ.get("POSTGRES_URI")
if not DB_URI:
    sys.exit("ERROR: POSTGRES_URI not found in .env")

SHOP_ID         = "00000000-0000-0000-0000-000000000001"
FUZZY_THRESHOLD = 80

STATUS_MAP = {
    "επιβεβαιωθηκε": ("confirmed", "unpaid"),
    "ολοκληρωθηκε":  ("completed", "paid"),
    "ακυρωθηκε":     ("cancelled", "unpaid"),
    "νεο":           ("new",       "unpaid"),
}

# Sample prices for auto-created services (keyword → EUR)
SAMPLE_PRICES = {
    "σαουνα":    15.00,
    "sauna":     15.00,
    "δωροκαρτα": 0.00,
    "hammam":    60.00,
    "μασαζ":     50.00,
    "massage":   50.00,
    "laser":     80.00,
    "scrub":     30.00,
    "προσωπο":   45.00,
    "πλατη":     40.00,
    "αυχενας":   35.00,
    "κεφαλι":    30.00,
    "ποδια":     35.00,
    "χερια":     30.00,
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def normalize(s) -> str:
    """Lowercase + strip Greek diacritics for robust matching."""
    if not pd.notna(s):
        return ""
    s = str(s).strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s


def sample_price(name: str) -> float:
    low = normalize(name)
    for kw, price in SAMPLE_PRICES.items():
        if kw in low:
            return price
    return 40.00


def fuzzy_match(query: str, norm_to_id: dict, norm_to_display: dict, threshold=FUZZY_THRESHOLD):
    """Return (id, display_name, score) or (None, None, 0)."""
    if not query or not norm_to_id:
        return None, None, 0
    result = process.extractOne(query, list(norm_to_id.keys()), scorer=fuzz.token_sort_ratio)
    if result and result[1] >= threshold:
        key = result[0]
        return norm_to_id[key], norm_to_display.get(key, key), result[1]
    return None, None, result[1] if result else 0


def load_lookups(cur):
    cur.execute("SELECT id, name FROM staff WHERE shop_id=%s AND is_active=true", (SHOP_ID,))
    rows = cur.fetchall()
    staff_id      = {normalize(r["name"]): str(r["id"]) for r in rows}
    staff_display = {normalize(r["name"]): r["name"]    for r in rows}

    cur.execute("SELECT id, name, price, duration_minutes FROM services WHERE shop_id=%s", (SHOP_ID,))
    rows = cur.fetchall()
    svc_id       = {normalize(r["name"]): str(r["id"])          for r in rows}
    svc_display  = {normalize(r["name"]): r["name"]             for r in rows}
    svc_price    = {str(r["id"]): float(r["price"])             for r in rows}
    svc_duration = {str(r["id"]): int(r["duration_minutes"])    for r in rows}

    cur.execute("SELECT id, first_name, last_name FROM clients WHERE shop_id=%s", (SHOP_ID,))
    rows = cur.fetchall()
    full = [f"{r['first_name']} {r['last_name']}" for r in rows]
    cli_id      = {normalize(n): str(r["id"]) for r, n in zip(rows, full)}
    cli_display = {normalize(n): n             for r, n in zip(rows, full)}

    return staff_id, staff_display, svc_id, svc_display, svc_price, svc_duration, cli_id, cli_display

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("excel", help="Path to the Excel file")
    parser.add_argument("--commit", action="store_true", help="Insert into DB (default: dry-run)")
    args = parser.parse_args()

    df = pd.read_excel(args.excel)
    df.columns = [c.strip() for c in df.columns]
    print(f"\nLoaded {len(df)} rows from '{args.excel}'")
    print(f"Shop ID: {SHOP_ID}\n")

    conn = psycopg2.connect(DB_URI)
    psycopg2.extras.register_uuid()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    staff_id, staff_display, svc_id, svc_display, svc_price, svc_duration, cli_id, cli_display = load_lookups(cur)

    # ── Phase 1: resolve every row (dry pass) ──────────────────────────────────

    rows_resolved = []   # list of dicts, one per Excel row

    for i, (_, row) in enumerate(df.iterrows(), start=1):
        issues = []

        # Date/time
        raw_date = row.get("Ημερομηνία ραντεβού") or row.get("Ημερομηνία") or ""
        try:
            start_time = raw_date if isinstance(raw_date, datetime) \
                else datetime.strptime(str(raw_date).strip(), "%d/%m/%Y %H:%M")
        except ValueError:
            rows_resolved.append({"row": i, "error": f"Cannot parse date: {raw_date!r}"})
            continue

        # Staff
        staff_raw  = str(row.get("Υπάλληλος", "")).strip()
        sid, s_disp, s_score = fuzzy_match(normalize(staff_raw), staff_id, staff_display)
        if not sid:
            issues.append(f"Staff '{staff_raw}' unmatched (score {s_score})")

        # Service — entire cell is ONE service name
        svc_raw = str(row.get("Υπηρεσία", "")).strip()
        vid, v_disp, v_score = fuzzy_match(normalize(svc_raw), svc_id, svc_display)
        svc_new   = vid is None
        svc_price_val = svc_price.get(vid, sample_price(svc_raw)) if vid else sample_price(svc_raw)
        svc_name_out  = v_disp if vid else svc_raw

        # Price override
        raw_price = row.get("Αξία", None)
        if pd.notna(raw_price) and str(raw_price).strip() not in ("", "nan"):
            try:
                svc_price_val = float(str(raw_price).replace(",", ".").replace("€", "").strip())
            except ValueError:
                pass

        # Client — entire cell is full name
        cli_raw  = str(row.get("Πελάτης", "")).strip()
        cid, c_disp, c_score = fuzzy_match(normalize(cli_raw), cli_id, cli_display)
        cli_new  = cid is None
        cli_name_out = c_disp if cid else cli_raw

        # Status
        status_norm = normalize(row.get("Status", "νεο"))
        db_status, db_payment = STATUS_MAP.get(status_norm, ("new", "unpaid"))
        deposit = svc_price_val if db_status == "completed" else 0.0

        rows_resolved.append({
            "row": i,
            "start_time":    start_time,
            "staff_id":      sid,
            "staff_display": s_disp or f"? {staff_raw}",
            "svc_raw":       svc_raw,
            "svc_id":        vid,
            "svc_display":   svc_name_out,
            "svc_new":       svc_new,
            "svc_price":     svc_price_val,
            "cli_raw":       cli_raw,
            "client_id":     cid,
            "cli_display":   cli_name_out,
            "cli_new":       cli_new,
            "status":        db_status,
            "payment_status": db_payment,
            "deposit":       deposit,
            "issues":        issues,
            "error":         None,
        })

    # ── Phase 2: print resolution table ───────────────────────────────────────

    # Distinct new services / clients
    new_svcs = {}   # norm → original name
    new_clis = {}   # norm → original name
    for r in rows_resolved:
        if r.get("error"):
            continue
        if r["svc_new"]:
            new_svcs[normalize(r["svc_raw"])] = r["svc_raw"]
        if r["cli_new"]:
            new_clis[normalize(r["cli_raw"])] = r["cli_raw"]

    if new_svcs:
        print("── New services to be created ────────────────────────────")
        for orig in new_svcs.values():
            print(f"  • {orig}  (sample price: €{sample_price(orig):.2f})")
        print()

    if new_clis:
        print("── New clients to be created ─────────────────────────────")
        for orig in new_clis.values():
            parts = orig.strip().split(" ", 1)
            first = parts[0].capitalize()
            last  = parts[1].capitalize() if len(parts) > 1 else ""
            print(f"  • {first} {last}")
        print()

    print(f"{'Row':<4} {'Date':<17} {'Staff':<18} {'Client':<22} {'Service':<38} {'€':>6} {'Status'}")
    print("─" * 115)

    warnings = []
    for r in rows_resolved:
        i = r["row"]
        if r.get("error"):
            print(f"{i:<4} ERROR: {r['error']}")
            continue
        cli_flag = " *NEW*" if r["cli_new"] else ""
        svc_flag = " *NEW*" if r["svc_new"] else ""
        print(
            f"{i:<4} {str(r['start_time'])[:16]:<17} "
            f"{r['staff_display'][:17]:<18} "
            f"{(r['cli_display'] or '?')[:20] + cli_flag:<22} "
            f"{(r['svc_display'] + svc_flag)[:37]:<38} "
            f"{r['svc_price']:>6.2f} {r['status']}"
        )
        for iss in r["issues"]:
            warnings.append(f"  Row {i}: ⚠  {iss}")

    if warnings:
        print("\nWarnings:")
        for w in warnings:
            print(w)

    errors   = sum(1 for r in rows_resolved if r.get("error"))
    skippable = sum(1 for r in rows_resolved if not r.get("error") and not r["staff_id"])
    print(f"\nSummary: {len(df)} rows | "
          f"{len(new_svcs)} new service(s) | "
          f"{len(new_clis)} new client(s) | "
          f"{errors} parse error(s) | "
          f"{skippable} row(s) with unmatched staff (will be skipped)")

    if not args.commit:
        print("\n[DRY RUN] No changes made. Re-run with --commit to insert.\n")
        conn.close()
        return

    # ── Phase 3: commit ────────────────────────────────────────────────────────

    print("\nCommitting...\n")
    try:
        # 3a. Insert distinct new services
        for orig in new_svcs.values():
            price = sample_price(orig)
            new_id = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO services (id, name, price, duration_minutes, shop_id) VALUES (%s,%s,%s,60,%s)",
                (new_id, orig.strip(), price, SHOP_ID),
            )
            norm = normalize(orig)
            svc_id[norm]        = new_id
            svc_display[norm]   = orig
            svc_price[new_id]   = price
            svc_duration[new_id] = 60
            print(f"  [SERVICE] Created '{orig}' id={new_id} price=€{price:.2f}")

        # 3b. Insert distinct new clients
        for orig in new_clis.values():
            parts = orig.strip().split(" ", 1)
            first = parts[0].capitalize()
            last  = parts[1].capitalize() if len(parts) > 1 else ""
            new_id = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO clients (id, first_name, last_name, shop_id) VALUES (%s,%s,%s,%s)",
                (new_id, first, last, SHOP_ID),
            )
            norm = normalize(orig)
            cli_id[norm]      = new_id
            cli_display[norm] = orig
            print(f"  [CLIENT]  Created '{first} {last}' id={new_id}")

        # 3c. Insert appointments + appointment_services
        inserted = skipped = 0
        for r in rows_resolved:
            if r.get("error") or not r["staff_id"]:
                print(f"  Row {r['row']}: SKIPPED")
                skipped += 1
                continue

            # Re-resolve client/service IDs (may have been just created above)
            final_cli = r["client_id"] or cli_id.get(normalize(r["cli_raw"]))
            final_svc = r["svc_id"]    or svc_id.get(normalize(r["svc_raw"]))
            final_price = svc_price.get(final_svc, r["svc_price"]) if final_svc else r["svc_price"]
            final_duration = svc_duration.get(final_svc, 60) if final_svc else 60
            deposit = final_price if r["status"] == "completed" else 0.0

            if not final_cli or not final_svc:
                print(f"  Row {r['row']}: SKIPPED (client or service still unresolved)")
                skipped += 1
                continue

            appt_id = str(uuid.uuid4())
            cur.execute(
                """INSERT INTO appointments
                     (id, client_id, status, payment_status, deposit_amount, shop_id, created_at, save_receipt)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,true)""",
                (appt_id, final_cli, r["status"], r["payment_status"], deposit, SHOP_ID, r["start_time"]),
            )
            cur.execute(
                """INSERT INTO appointment_services
                     (appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (appt_id, final_svc, r["staff_id"], r["start_time"], final_duration, final_price, SHOP_ID),
            )
            inserted += 1

        conn.commit()
        print(f"\nDone. {inserted} appointment(s) inserted, {skipped} skipped.\n")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR — all changes rolled back: {e}\n")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
