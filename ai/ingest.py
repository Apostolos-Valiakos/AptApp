"""Ingest policy files for one shop from the command line.

    python ingest.py --shop <shop_id> policies/*.pdf
"""

import argparse
from pathlib import Path

from app import rag


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shop", required=True, help="Shop id the documents belong to")
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()

    for path in args.files:
        doc = rag.ingest_bytes(args.shop, path.name, path.read_bytes())
        print(f"{path.name}: {doc['chunks']} chunks (id {doc['id']})")


if __name__ == "__main__":
    main()
