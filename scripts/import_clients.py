#!/usr/bin/env python3
"""
Adds new clients from an .xlsx export and fills missing details on existing
ones (column A full name, B phone, C email).

Usage:
    python scripts/import_clients.py <file.xlsx>            # dry run
    python scripts/import_clients.py <file.xlsx> --commit   # apply

- Existing client = same phone (digits only, +30 optional) and same name (any
  word order, ignoring case and accents). Its empty email is filled.
- An existing client with no phone whose two-or-more-word name matches gets
  the file's phone (and email if empty).
- Anything else with a free phone number is added as a new client: first word
  = surname, the rest = first name.
- Unclear rows are skipped and printed: phone used by a client with another
  name, same name already with another phone, phone shared by different names
  in the file, one-word name matches, no phone, junk names.
"""

import argparse
import os
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
DB_URI = os.environ.get("POSTGRES_URI")
if not DB_URI:
    sys.exit("ERROR: POSTGRES_URI not found in .env")

SHOP_ID = "00000000-0000-0000-0000-000000000001"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_xlsx_rows(path):
    """First sheet as lists of cell strings (no external dependency)."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        sheet = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
        rows = []
        for row in ET.fromstring(z.read(sheet)).iter(f"{{{NS['m']}}}row"):
            cells = {}
            for c in row.findall("m:c", NS):
                col = re.match(r"[A-Z]+", c.get("r")).group()
                index = 0
                for ch in col:
                    index = index * 26 + ord(ch) - 64
                kind = c.get("t")
                if kind == "inlineStr":
                    value = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
                else:
                    v = c.find("m:v", NS)
                    value = "" if v is None else v.text or ""
                    if kind == "s" and value:
                        value = shared[int(value)]
                cells[index - 1] = value
            rows.append([cells.get(i, "") for i in range(3)])
        return rows


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def phone_key(raw):
    d = re.sub(r"\D", "", str(raw or ""))
    if d.startswith("00"):
        d = d[2:]
    if len(d) == 10 and re.match(r"^(2|69)", d):
        d = "30" + d
    return d


def name_key(raw):
    s = unicodedata.normalize("NFD", str(raw or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower().replace("ς", "σ")
    s = re.sub(r"[^\w\s]|[\d_]", " ", s)
    return " ".join(sorted(s.split()))


def full_name(c):
    return clean(f"{c['first_name']} {c['last_name']}")


def plan(rows, clients):
    by_phone, by_name, file_names = {}, {}, {}
    for c in clients:
        if phone_key(c["phone"]):
            by_phone.setdefault(phone_key(c["phone"]), []).append(c)
        by_name.setdefault(name_key(full_name(c)), []).append(c)
    for r in rows:
        p = phone_key(r["phone"])
        if len(p) >= 8:
            file_names.setdefault(p, set()).add(name_key(r["name"]))

    out = {"matched": 0, "add": [], "fill": [], "skipped": []}
    filled = set()

    def fill(client, field, value):
        if not value or client[field] or (client["id"], field) in filled:
            return
        filled.add((client["id"], field))
        out["fill"].append((client["id"], field, value))

    def skip(row, reason):
        out["skipped"].append((row, reason))

    new_by_phone = {}
    for row in rows:
        n_key, p_key = name_key(row["name"]), phone_key(row["phone"])
        if not n_key or row["name"].startswith("."):
            skip(row, "junk name")
            continue
        if len(p_key) < 8:
            skip(row, "no phone")
            continue

        same_phone = [c for c in by_phone.get(p_key, []) if not c["is_deleted"]]
        exact = [c for c in same_phone if name_key(full_name(c)) == n_key]
        if exact:
            out["matched"] += 1
            if not any(c["email"] for c in exact):
                fill(exact[0], "email", row["email"])
            continue
        if same_phone:
            skip(row, "phone belongs to " + " / ".join(full_name(c) for c in same_phone))
            continue
        if len(file_names[p_key]) > 1:
            skip(row, "phone shared by different names in the file")
            continue

        same_name = [c for c in by_name.get(n_key, []) if not c["is_deleted"]]
        no_phone = [c for c in same_name if not phone_key(c["phone"])]
        if len(no_phone) == 1 and " " in n_key:
            out["matched"] += 1
            fill(no_phone[0], "phone", row["phone"])
            fill(no_phone[0], "email", row["email"])
            continue
        if len(no_phone) == 1:
            skip(row, f"one-word name matches {full_name(no_phone[0])}")
            continue
        if same_name:
            phones = " / ".join(c["phone"] or "none" for c in same_name)
            skip(row, f"same name already exists with phone {phones}")
            continue

        if p_key in new_by_phone:
            if not new_by_phone[p_key]["email"]:
                new_by_phone[p_key]["email"] = row["email"]
            continue
        words = row["name"].split(" ")
        client = {
            "last_name": words[0] if len(words) > 1 else "",
            "first_name": " ".join(words[1:]) if len(words) > 1 else words[0],
            "phone": row["phone"],
            "email": row["email"],
        }
        new_by_phone[p_key] = client
        out["add"].append(client)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", help="Clients export (.xlsx): A name, B phone, C email")
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args()

    rows = []
    for i, r in enumerate(read_xlsx_rows(args.xlsx), start=1):
        row = {
            "line": i,
            "name": clean(r[0]),
            "phone": re.sub(r"[.,;]+$", "", clean(r[1])),
            "email": clean(r[2]).lower(),
        }
        if row["name"] or row["phone"]:
            rows.append(row)

    conn = psycopg2.connect(DB_URI)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT id, first_name, last_name, phone, email, COALESCE(is_deleted, false) AS is_deleted
           FROM clients WHERE shop_id = %s""",
        (SHOP_ID,),
    )
    clients = cur.fetchall()
    out = plan(rows, clients)

    if out["skipped"]:
        print("Skipped rows (add these by hand if needed):")
        for row, reason in out["skipped"]:
            print(f"  line {row['line']}: {row['name']} {row['phone']} -> {reason}")
        print()
    phones = sum(1 for f in out["fill"] if f[1] == "phone")
    print(f"File rows: {len(rows)} | clients in DB: {len(clients)}")
    print(f"  already in DB          {out['matched']}")
    print(f"  new clients to add     {len(out['add'])}")
    print(f"  phones to fill         {phones}")
    print(f"  emails to fill         {len(out['fill']) - phones}")
    print(f"  skipped (listed above) {len(out['skipped'])}")

    if not args.commit:
        print("\n[DRY RUN] No changes made. Re-run with --commit to apply.")
        conn.close()
        return
    try:
        for c in out["add"]:
            cur.execute(
                """INSERT INTO clients (first_name, last_name, phone, email, shop_id)
                   VALUES (%s, %s, %s, NULLIF(%s, ''), %s)""",
                (c["first_name"], c["last_name"], c["phone"], c["email"], SHOP_ID),
            )
        for client_id, field, value in out["fill"]:
            column = "email" if field == "email" else "phone"
            cur.execute(
                f"UPDATE clients SET {column} = %s WHERE id = %s AND COALESCE({column}, '') = ''",
                (value, client_id),
            )
        conn.commit()
        print(f"Done: added {len(out['add'])} clients, filled {len(out['fill'])} fields.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
