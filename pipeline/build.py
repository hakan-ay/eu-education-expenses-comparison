"""Build the DuckDB warehouse, run data tests and export marts for the website.

Usage:
    python -m pipeline.build                  # from data/interim (after extract + parse)
    python -m pipeline.build --from-snapshot  # from the committed staging snapshot (CI)

A full build also refreshes data/snapshot/: every staging view saved as Parquet. The
snapshot is small enough to commit, so CI can rebuild core + marts, run the data tests
and check the exported JSON without downloading the sources.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import duckdb

from pipeline import sources as S

SQL_DIR = S.ROOT / "pipeline" / "sql"
SNAPSHOT_DIR = S.ROOT / "data" / "snapshot"
STAGING_SQL = "01_staging.sql"

# mart table -> exported file name
EXPORTS = {
    "mart.city_comparison": "cities.json",
    "mart.city_enrolment_trend": "city_trend.json",
    "mart.university_profile": "universities.json",
    "mart.field_outcomes": "fields.json",
    "mart.city_field_enrolment": "city_fields.json",
    "mart.eu_country_latest": "eu_latest.json",
    "mart.eu_country_series": "eu_series.json",
}


def run_models(con: duckdb.DuckDBPyConnection, from_snapshot: bool) -> None:
    for path in sorted(SQL_DIR.glob("*.sql")):
        if from_snapshot and path.name == STAGING_SQL:
            load_snapshot(con)
            continue
        print(f"  model  {path.name}")
        con.execute(path.read_text())


def staging_views(con: duckdb.DuckDBPyConnection) -> list[str]:
    rows = con.sql("select view_name from duckdb_views() where schema_name = 'stg' order by 1").fetchall()
    return [r[0] for r in rows]


def write_snapshot(con: duckdb.DuckDBPyConnection) -> None:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    for old in SNAPSHOT_DIR.glob("*.parquet"):
        old.unlink()
    for view in staging_views(con):
        # Sorted so an unchanged source gives a byte-identical file.
        con.execute(f"copy (select * from stg.{view} order by all) to '{SNAPSHOT_DIR / view}.parquet' "
                    "(format parquet, compression zstd)")
    print(f"  snapshot {len(staging_views(con))} staging views -> {SNAPSHOT_DIR.relative_to(S.ROOT)}/")


def load_snapshot(con: duckdb.DuckDBPyConnection) -> None:
    files = sorted(SNAPSHOT_DIR.glob("*.parquet"))
    if not files:
        sys.exit(f"No snapshot in {SNAPSHOT_DIR} - run a full build first.")
    print(f"  model  {STAGING_SQL} <- {len(files)} snapshot files")
    con.execute("create schema if not exists stg")
    for f in files:
        con.execute(f"create or replace view stg.{f.stem} as select * from read_parquet('{f}')")


def run_tests(con: duckdb.DuckDBPyConnection) -> list[dict]:
    results = []
    for path in sorted((SQL_DIR / "tests").glob("*.sql")):
        failing = con.sql(path.read_text()).fetchall()
        description = path.read_text().splitlines()[0].removeprefix("--").strip()
        status = "pass" if not failing else "FAIL"
        print(f"  test   {status:<4} {path.stem}" + (f"  -> {failing[:3]}" if failing else ""))
        results.append({"test": path.stem, "description": description, "passed": not failing,
                        "failing_rows": len(failing)})
    return results


def export(con: duckdb.DuckDBPyConnection, tests: list[dict]) -> None:
    S.WEB_DATA.mkdir(parents=True, exist_ok=True)
    for table, filename in EXPORTS.items():
        df = con.sql(f"select * from {table}").df()
        # NaN -> null so the JSON is valid and the UI can show "n/a".
        records = json.loads(df.to_json(orient="records"))
        (S.WEB_DATA / filename).write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")))
        print(f"  export {filename:<18} {len(records):>5} rows")

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "reference_periods": con.sql("select * from core.reference_periods").df().to_dict("records"),
        "tests": tests,
        "sources": json.loads((S.ROOT / "data" / "sources_manifest.json").read_text()),
    }
    (S.WEB_DATA / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--from-snapshot", action="store_true",
                        help="read staging from data/snapshot/ instead of data/interim/")
    args = parser.parse_args()

    os.chdir(S.ROOT)  # SQL files use paths relative to the repository root
    S.WAREHOUSE.unlink(missing_ok=True)
    with duckdb.connect(str(S.WAREHOUSE)) as con:
        run_models(con, args.from_snapshot)
        tests = run_tests(con)
        export(con, tests)
        if not args.from_snapshot:
            write_snapshot(con)
    if not all(t["passed"] for t in tests):
        sys.exit("Data tests failed - see above.")


if __name__ == "__main__":
    main()
