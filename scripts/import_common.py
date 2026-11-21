"""
What the data scripts share (import_appointments.py, sync_bookings.py,
import_clients.py): the database address from the repo's .env, Pure's shop
id, and accent-insensitive name matching.

Imported as a sibling module, so the scripts are run as files
(`python scripts/<name>.py`), as DEPLOY.md and import_future_bookings.sh do.
It needs only python-dotenv; rapidfuzz is loaded by best_match alone, so
import_clients.py (which doesn't fuzzy-match) doesn't need it.
"""

import os
import sys
import unicodedata

from dotenv import load_dotenv

# Pure Spa and Massage, the shop the exports come from.
SHOP_ID = "00000000-0000-0000-0000-000000000001"
# The lowest rapidfuzz score accepted as the same name.
FUZZY_THRESHOLD = 80


def db_uri() -> str:
    """POSTGRES_URI from the repo's .env (or the environment); stops the script without it."""
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    uri = os.environ.get("POSTGRES_URI")
    if not uri:
        sys.exit("ERROR: POSTGRES_URI not found in .env")
    return uri


def _missing(s) -> bool:
    # An empty spreadsheet cell: None, NaN / NaT (not equal to themselves) or
    # pandas' NA (which can't be compared at all).
    if s is None:
        return True
    try:
        return bool(s != s)
    except (TypeError, ValueError):
        return True


def normalize(s) -> str:
    """Lowercase, trimmed, without Greek accents: the key names are matched on. Empty cells give ""."""
    if _missing(s):
        return ""
    s = unicodedata.normalize("NFD", str(s).strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def best_match(query: str, keys, threshold=FUZZY_THRESHOLD):
    """The key closest to `query` (rapidfuzz token_sort_ratio) and its score;
    (None, score) when the best is below `threshold`, (None, 0) with nothing to match."""
    keys = list(keys)
    if not query or not keys:
        return None, 0
    from rapidfuzz import fuzz, process

    result = process.extractOne(query, keys, scorer=fuzz.token_sort_ratio)
    if result and result[1] >= threshold:
        return result[0], result[1]
    return None, result[1] if result else 0
