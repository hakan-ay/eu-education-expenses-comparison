"""Build the DuckDB warehouse, run data tests and export marts for the website.

Usage:
    python -m pipeline.build
"""

import json
import os
import sys
from datetime import datetime, timezone

import duckdb

from pipeline import sources as S

SQL_DIR = S.ROOT / "pipeline" / "sql"

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


def run_models(con: duckdb.DuckDBPyConnection) -> None:
    for path in sorted(SQL_DIR.glob("*.sql")):
        print(f"  model  {path.name}")
        con.execute(path.read_text())


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
    os.chdir(S.ROOT)  # SQL files use paths relative to the repository root
    S.WAREHOUSE.unlink(missing_ok=True)
    with duckdb.connect(str(S.WAREHOUSE)) as con:
        run_models(con)
        tests = run_tests(con)
        export(con, tests)
    if not all(t["passed"] for t in tests):
        sys.exit("Data tests failed - see above.")


if __name__ == "__main__":
    main()
