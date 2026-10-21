"""Download every raw source into data/raw/ and record a manifest.

Usage:
    python -m pipeline.extract            # download what is missing
    python -m pipeline.extract --refresh  # re-download everything
"""

import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

from pipeline import sources as S

session = requests.Session()
session.headers["User-Agent"] = S.USER_AGENT


def fetch(url: str, dest: Path, refresh: bool, timeout: int = 180) -> dict:
    """Download url to dest unless it already exists; return a manifest row."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if refresh or not dest.exists():
        print(f"  ↓ {dest.relative_to(S.ROOT)}")
        resp = session.get(url, timeout=timeout)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
    else:
        print(f"  ✓ {dest.relative_to(S.ROOT)} (cached)")
    return {
        "file": str(dest.relative_to(S.ROOT)),
        "url": url,
        "bytes": dest.stat().st_size,
        "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
        "retrieved_at": datetime.fromtimestamp(dest.stat().st_mtime, timezone.utc).isoformat(timespec="seconds"),
    }


def mur_resource_url(package: str, name_part: str, fmt: str) -> str:
    meta = session.get(S.MUR_CKAN.format(package=package), timeout=60).json()["result"]
    candidates = [r for r in meta["resources"] if r["format"].upper() == fmt.upper()]
    # Names carry a year prefix in yearly packages ("2024 Spesa per interventi").
    clean = lambda r: re.sub(r"^\d{4}\s+", "", r["name"]).strip().lower()  # noqa: E731
    matches = [r for r in candidates if clean(r) == name_part.lower()] or [
        r for r in candidates if clean(r).startswith(name_part.lower())
    ]
    if len(matches) != 1:
        names = [r["name"] for r in meta["resources"]]
        raise RuntimeError(f"Expected 1 resource matching {name_part!r} in {package}, got {len(matches)}: {names}")
    return matches[0]["url"]


def extract_mur(refresh: bool) -> list[dict]:
    print("MUR / USTAT")
    rows = []
    for filename, (package, name_part) in S.MUR_RESOURCES.items():
        dest = S.RAW / "mur" / filename
        rows.append(fetch(mur_resource_url(package, name_part, dest.suffix[1:]), dest, refresh))
    return rows


def extract_almalaurea(refresh: bool) -> list[dict]:
    print("AlmaLaurea")
    rows = []
    for course_type, years_after in S.ALMALAUREA_COHORTS:
        for breakdown in S.ALMALAUREA_BREAKDOWNS:
            url = S.ALMALAUREA_URL.format(
                year=S.ALMALAUREA_SURVEY_YEAR, course_type=course_type,
                years_after=years_after, breakdown=breakdown,
            )
            dest = S.RAW / "almalaurea" / f"{S.ALMALAUREA_SURVEY_YEAR}_{course_type}_{years_after}y_{breakdown}.html"
            existed = dest.exists()
            rows.append(fetch(url, dest, refresh))
            if refresh or not existed:
                time.sleep(3)  # be polite: each page is a heavy query on their side
    return rows


def extract_eurostat(refresh: bool) -> list[dict]:
    print("Eurostat")
    return [
        fetch(S.EUROSTAT_URL.format(code=code), S.RAW / "eurostat" / f"{code}.tsv.gz", refresh)
        for code in S.EUROSTAT_DATASETS
    ]


def extract_other(refresh: bool) -> list[dict]:
    print("OMI + ISTAT")
    return [
        fetch(S.OMI_REPORT_URL, S.RAW / "omi" / "rapporto_immobiliare_2026.pdf", refresh),
        fetch(S.ISTAT_COMUNI_URL, S.RAW / "istat" / "comuni.json", refresh),
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="re-download every file")
    args = parser.parse_args()

    manifest_path = S.RAW / "manifest.json"
    rows = []
    for step in (extract_mur, extract_almalaurea, extract_eurostat, extract_other):
        rows += step(args.refresh)
    manifest_path.write_text(json.dumps(rows, indent=2))
    # A copy without checksums is committed so readers can see exact provenance.
    (S.SEEDS.parent / "sources_manifest.json").write_text(
        json.dumps([{k: r[k] for k in ("file", "url", "retrieved_at")} for r in rows], indent=2)
    )
    print(f"Done: {len(rows)} files")


if __name__ == "__main__":
    main()
