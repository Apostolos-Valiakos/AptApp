#!/usr/bin/env python3
"""
Sync a full Treatwell/Fresha-style bookings export into appointments +
appointment_services, skipping rows that are already in the DB.

"Already present" is determined per (client, staff, service, exact start_time)
key, comparing COUNTS (not just presence) — so if a key appears twice in the
file and twice in the DB, nothing new is inserted for it; if it appears twice
in the file but only once in the DB, exactly one new row is inserted. This
correctly handles legitimate parallel bookings (e.g. shared sauna/hammam slots)
without either dropping real visits or re-inserting already-imported ones.

Usage:
    python scripts/sync_bookings.py <path-to.xlsx>            # dry-run
    python scripts/sync_bookings.py <path-to.xlsx> --commit    # apply
"""

import sys
import os
import uuid
import argparse
import unicodedata
from datetime import datetime
from collections import Counter

import psycopg2
import psycopg2.extras
import pandas as pd
from rapidfuzz import process, fuzz
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
DB_URI = os.environ.get("POSTGRES_URI")
if not DB_URI:
    sys.exit("ERROR: POSTGRES_URI not found in .env")

SHOP_ID = "00000000-0000-0000-0000-000000000001"
FUZZY_THRESHOLD = 80

STATUS_MAP = {
    "επιβεβαιωθηκε": ("confirmed", "unpaid"),
    "ολοκληρωθηκε":  ("completed", "paid"),
    "ακυρωθηκε":     ("cancelled", "unpaid"),
    "μη εμφανιση":   ("no-show",   "unpaid"),
}


def normalize(s) -> str:
    if not pd.notna(s):
        return ""
    s = str(s).strip().lower()
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def fuzzy_match(query: str, norm_to_id: dict, threshold=FUZZY_THRESHOLD):
    if not query or not norm_to_id:
        return None, 0
    result = process.extractOne(query, list(norm_to_id.keys()), scorer=fuzz.token_sort_ratio)
    if result and result[1] >= threshold:
        return norm_to_id[result[0]], result[1]
    return None, result[1] if result else 0


def load_lookups(cur):
    cur.execute("SELECT id, name FROM staff WHERE shop_id=%s", (SHOP_ID,))
    rows = cur.fetchall()
    staff_map = {normalize(r["name"]): str(r["id"]) for r in rows}

    cur.execute("SELECT id, name, price, duration_minutes FROM services WHERE shop_id=%s", (SHOP_ID,))
    rows = cur.fetchall()
    svc_map = {normalize(r["name"]): str(r["id"]) for r in rows}
    svc_price = {str(r["id"]): float(r["price"]) for r in rows}
    svc_duration = {str(r["id"]): int(r["duration_minutes"]) for r in rows}

    cur.execute("SELECT id, first_name, last_name FROM clients WHERE shop_id=%s", (SHOP_ID,))
    rows = cur.fetchall()
    cli_map = {normalize(f"{r['first_name']} {r['last_name']}"): str(r["id"]) for r in rows}

    return staff_map, svc_map, svc_price, svc_duration, cli_map


def load_existing_key_counts(cur):
    cur.execute(
        """
        SELECT c.first_name || ' ' || c.last_name as client_name,
               st.name as staff_name, s.name as service_name, aps.start_time
        FROM appointments a
        JOIN clients c ON a.client_id = c.id
        JOIN appointment_services aps ON aps.appointment_id = a.id
        LEFT JOIN staff st ON aps.staff_id = st.id
        LEFT JOIN services s ON aps.service_id = s.id
        WHERE a.shop_id = %s
        """,
        (SHOP_ID,),
    )
    counts = Counter()
    for r in cur.fetchall():
        key = (
            normalize(r["client_name"]),
            normalize(r["staff_name"]),
            normalize(r["service_name"]),
            r["start_time"].strftime("%Y-%m-%d %H:%M"),
        )
        counts[key] += 1
    return counts


def create_client(cur, full_name: str) -> str:
    parts = full_name.strip().split(" ", 1)
    first = parts[0].capitalize()
    last = parts[1].capitalize() if len(parts) > 1 else ""
    cid = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO clients (id, first_name, last_name, shop_id) VALUES (%s, %s, %s, %s)",
        (cid, first, last, SHOP_ID),
    )
    return cid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("excel", help="Path to the bookings .xlsx file")
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args()

    df = pd.read_excel(args.excel)
    df.columns = [c.strip() for c in df.columns]
    print(f"\nLoaded {len(df)} rows from '{args.excel}'\n")

    conn = psycopg2.connect(DB_URI)
    psycopg2.extras.register_uuid()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    staff_map, svc_map, svc_price, svc_duration, cli_map = load_lookups(cur)
    staff_display = {k: k for k in staff_map}  # not needed for display precision here
    existing_counts = load_existing_key_counts(cur)
    seen_in_file = Counter()

    new_rows = []
    skipped_existing = 0
    errors = []

    for i, (_, row) in enumerate(df.iterrows(), start=1):
        raw_date = row.get("Ημερομηνία ραντεβού")
        try:
            start_time = raw_date if isinstance(raw_date, datetime) else datetime.strptime(
                str(raw_date).strip(), "%d/%m/%Y %H:%M"
            )
        except (ValueError, TypeError):
            errors.append(f"Row {i}: cannot parse appointment date {raw_date!r}")
            continue

        raw_order_date = row.get("Ημερομηνία παραγγελίας")
        try:
            order_date = raw_order_date if isinstance(raw_order_date, datetime) else datetime.strptime(
                str(raw_order_date).strip(), "%d/%m/%Y %H:%M"
            )
        except (ValueError, TypeError):
            order_date = start_time  # fallback: use appointment time itself

        client_raw = str(row.get("Πελάτης", "")).strip()
        staff_raw = str(row.get("Υπάλληλος", "")).strip()
        service_raw = str(row.get("Υπηρεσία", "")).strip()

        key = (normalize(client_raw), normalize(staff_raw), normalize(service_raw),
               start_time.strftime("%Y-%m-%d %H:%M"))
        seen_in_file[key] += 1

        if seen_in_file[key] <= existing_counts.get(key, 0):
            skipped_existing += 1
            continue  # this occurrence already exists in the DB

        # --- Resolve staff/service/client for a genuinely new row ---
        staff_id, staff_score = fuzzy_match(normalize(staff_raw), staff_map)
        if not staff_id:
            errors.append(f"Row {i}: staff '{staff_raw}' not matched (score {staff_score})")
            continue

        svc_id, svc_score = fuzzy_match(normalize(service_raw), svc_map)
        if not svc_id:
            errors.append(f"Row {i}: service '{service_raw}' not matched (score {svc_score})")
            continue

        client_norm = normalize(client_raw)
        client_id, _ = fuzzy_match(client_norm, cli_map)
        client_new = False
        if not client_id:
            client_new = True
            if args.commit:
                client_id = create_client(cur, client_raw)
                cli_map[client_norm] = client_id

        raw_price = row.get("Αξία", None)
        if pd.notna(raw_price) and str(raw_price).strip() not in ("", "nan"):
            try:
                price = float(str(raw_price).replace(",", ".").replace("€", "").strip())
            except ValueError:
                price = svc_price.get(svc_id, 0)
        else:
            price = svc_price.get(svc_id, 0)

        status_norm = normalize(row.get("Status", ""))
        db_status, db_payment = STATUS_MAP.get(status_norm, ("new", "unpaid"))
        deposit = price if db_status == "completed" else 0.0

        new_rows.append({
            "row": i,
            "start_time": start_time,
            "order_date": order_date,
            "staff_id": staff_id,
            "staff_display": staff_raw,
            "client_id": client_id,
            "client_display": client_raw,
            "client_new": client_new,
            "service_id": svc_id,
            "service_display": service_raw,
            "price": price,
            "duration": svc_duration.get(svc_id, 60),
            "status": db_status,
            "payment_status": db_payment,
            "deposit": deposit,
        })

    # --- Report ---
    print(f"Already in DB (skipped): {skipped_existing}")
    print(f"New rows to insert: {len(new_rows)}")
    if errors:
        print(f"\nErrors ({len(errors)}):")
        for e in errors[:30]:
            print(f"  ⚠ {e}")
        if len(errors) > 30:
            print(f"  ... and {len(errors) - 30} more")

    new_clients = {r["client_display"] for r in new_rows if r["client_new"]}
    if new_clients:
        print(f"\nNew clients to be created ({len(new_clients)}):")
        for n in sorted(new_clients):
            print(f"  • {n}")

    print(f"\n{'Row':<6} {'Date':<17} {'Staff':<20} {'Client':<22} {'Service':<38} {'€':>7} {'Status'}")
    print("─" * 130)
    for r in new_rows[:200]:
        client_flag = " *NEW*" if r["client_new"] else ""
        print(
            f"{r['row']:<6} {str(r['start_time'])[:16]:<17} {r['staff_display'][:19]:<20} "
            f"{(r['client_display'][:20] + client_flag):<22} {r['service_display'][:37]:<38} "
            f"{r['price']:>7.2f} {r['status']}"
        )
    if len(new_rows) > 200:
        print(f"  ... and {len(new_rows) - 200} more rows")

    if not args.commit:
        print("\n[DRY RUN] No changes made. Re-run with --commit to insert.\n")
        conn.close()
        return

    print("\nCommitting...\n")
    inserted = 0
    try:
        for r in new_rows:
            appt_id = str(uuid.uuid4())
            cur.execute(
                """INSERT INTO appointments
                     (id, client_id, status, payment_status, deposit_amount, shop_id, created_at, save_receipt)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, true)""",
                (appt_id, r["client_id"], r["status"], r["payment_status"], r["deposit"],
                 SHOP_ID, r["order_date"]),
            )
            cur.execute(
                """INSERT INTO appointment_services
                     (appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (appt_id, r["service_id"], r["staff_id"], r["start_time"], r["duration"], r["price"], SHOP_ID),
            )
            inserted += 1
        conn.commit()
        print(f"Done. {inserted} appointments inserted.\n")
    except Exception as e:
        conn.rollback()
        print(f"\nERROR — rolled back all changes: {e}\n")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
