"""Turn the non-tabular raw sources into tidy CSVs in data/interim/.

MUR files are already CSV and are read straight into DuckDB by the SQL layer;
this module only handles sources that need real parsing:

* AlmaLaurea  - wide HTML report tables (one column per university / field)
* OMI         - rent tables printed inside a 130-page PDF report
* Eurostat    - SDMX TSV with packed dimension keys and flagged values
* ISTAT       - JSON list of municipalities
"""

import gzip
import io
import json
import re

import pandas as pd
import pdfplumber

from pipeline import sources as S

EU27 = [
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU",
    "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
]


# --- AlmaLaurea --------------------------------------------------------------

def clean_entity(name) -> str:
    """'Milano Humanitas\xa0(1)' / 'Roma Link(1) (2)' -> 'Milano Humanitas' / 'Roma Link'."""
    name = str(name).replace("\xa0", " ").replace("’", "'")
    return re.sub(r"(\s*\(\d\))+\s*$", "", name).strip()


def parse_almalaurea_page(path, course_type: str, years_after: int, breakdown: str) -> pd.DataFrame:
    """One report page -> long rows (entity, section, group, indicator, value).

    Each table has a section title in the header, a first column of row labels,
    a national total column and one column per university (or field). Rows whose
    values are all empty are group headings ("Tasso di occupazione") that give
    context to the rows below them ("Uomini", "Donne", "Totale").
    """
    # Italian number format: "1.285" is one thousand, "64,9" is a decimal.
    tables = pd.read_html(path, decimal=",", thousands=".", na_values=["-", "–", ""])
    rows = []
    for table in tables:
        section = str(table.columns[0][0]).strip()
        entities = ["ITALIA"] + [clean_entity(c[1]) for c in table.columns[2:]]
        group = None
        for _, r in table.iterrows():
            label = str(r.iloc[0]).strip()
            values = pd.to_numeric(r.iloc[1:], errors="coerce")
            if values.isna().all():
                group = label
                continue
            for entity, value in zip(entities, values):
                rows.append((entity, section, group or label, label, value))
    df = pd.DataFrame(rows, columns=["entity", "section", "indicator_group", "indicator", "value"])
    # The page repeats some tables for a sub-population; keep the first occurrence.
    df = df.drop_duplicates(["entity", "section", "indicator_group", "indicator"], keep="first")
    df.insert(0, "breakdown", breakdown)
    df.insert(0, "years_after", years_after)
    df.insert(0, "course_type", course_type)
    df.insert(0, "survey_year", S.ALMALAUREA_SURVEY_YEAR)
    return df


def parse_almalaurea() -> pd.DataFrame:
    frames = []
    for course_type, years_after in S.ALMALAUREA_COHORTS:
        for breakdown in S.ALMALAUREA_BREAKDOWNS:
            path = S.RAW / "almalaurea" / f"{S.ALMALAUREA_SURVEY_YEAR}_{course_type}_{years_after}y_{breakdown}.html"
            frames.append(parse_almalaurea_page(path, course_type, years_after, breakdown))
    return pd.concat(frames, ignore_index=True)


# --- OMI rents ---------------------------------------------------------------

# Table numbers in the 2026 report, per market segment.
OMI_TABLES = {
    "ORD_L": {"area": 52, "region": 53, "city": 54},  # ordinary, long term (3+2 yrs)
    "ORD_T": {"area": 55, "region": 56, "city": 57},  # ordinary, transitional (< 18 months)
    "AGE_L": {"area": 58, "region": 59, "city": 60},  # regulated rent, long term
    "AGE_T": {"area": 61, "region": 62, "city": 63},  # regulated, transitional (incl. student contracts)
}
OMI_ROW = re.compile(
    r"^(?P<name>\D+?) (?P<contracts>[\d.]+) (?P<iml>[\d,]+)% (?P<sqm_total>[\d.]+) "
    r"(?P<sqm_avg>[\d,]+) (?P<rent_total_m>[\d.,]+) (?P<rent_sqm_year>[\d,]+)$",
    re.M,
)


def _it_number(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))


def parse_omi() -> pd.DataFrame:
    with pdfplumber.open(S.RAW / "omi" / "rapporto_immobiliare_2026.pdf") as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    rows = []
    for segment, tables in OMI_TABLES.items():
        for level, number in tables.items():
            start = text.find(f"Tabella {number}:")
            if start < 0:
                raise ValueError(f"OMI table {number} not found - has the report layout changed?")
            ends = [i for i in (text.find("Tabella", start + 10), text.find("Figura", start + 10)) if i > 0]
            block = text[start:min(ends)]
            for m in OMI_ROW.finditer(block):
                name = re.sub(r"\s*-\s*", "-", m["name"]).strip()  # "Friuli- Venezia Giulia"
                if name.upper() in ("TOTALE", "ITALIA"):
                    level_out, name = "country", "Italia"
                elif level == "area" or name in ("Nord Est", "Nord Ovest", "Centro", "Sud", "Isole"):
                    level_out = "area"
                else:
                    level_out = level
                rows.append({
                    "segment": segment,
                    "level": level_out,
                    "area_name": name.title() if level_out == "city" else name,
                    "contracts": int(_it_number(m["contracts"])),
                    "avg_sqm": _it_number(m["sqm_avg"]),
                    "total_sqm": _it_number(m["sqm_total"]),
                    "total_rent_eur_m": _it_number(m["rent_total_m"]),
                    "rent_eur_sqm_year": _it_number(m["rent_sqm_year"]),
                    "source_table": number,
                    "reference_year": S.OMI_REPORT_YEAR,
                })
    df = pd.DataFrame(rows).drop_duplicates(["segment", "level", "area_name"])
    n_regions = df.query("level == 'region'").groupby("segment").size()
    n_cities = df.query("level == 'city'").groupby("segment").size()
    assert (n_regions == 19).all(), f"expected 19 regions per segment, got {n_regions.to_dict()}"
    assert (n_cities == 8).all(), f"expected 8 cities per segment, got {n_cities.to_dict()}"
    return df


# --- Eurostat ----------------------------------------------------------------

def parse_eurostat(code: str) -> pd.DataFrame:
    """SDMX TSV -> long table, limited to EU27 countries and the EU27 aggregate."""
    with gzip.open(S.RAW / "eurostat" / f"{code}.tsv.gz", "rt") as f:
        raw = pd.read_csv(f, sep="\t", dtype=str)
    key_col = raw.columns[0]
    dims = key_col.split("\\")[0].split(",")
    keys = raw[key_col].str.split(",", expand=True)
    keys.columns = dims
    keys = keys.rename(columns={dims[-1]: "geo"})
    df = pd.concat([keys, raw.drop(columns=key_col)], axis=1)
    df = df[df["geo"].isin(EU27 + ["EU27_2020"])]
    long = df.melt(id_vars=list(keys.columns), var_name="year", value_name="raw_value")
    long["year"] = long["year"].str.strip().astype(int)
    # Values look like "12.3", "12.3 b" (break in series), ": " (missing) or ": c" (confidential).
    parts = long["raw_value"].str.strip().str.extract(r"^(?P<value>[-\d.]+|:)\s*(?P<flag>[a-z]*)$")
    long["value"] = pd.to_numeric(parts["value"].replace(":", None), errors="coerce")
    long["flag"] = parts["flag"].fillna("")
    long = long.drop(columns="raw_value").dropna(subset=["value"])
    long.insert(0, "dataset", code)
    return long


# --- MUR CSV encoding ---------------------------------------------------------

def normalise_mur() -> dict[str, str]:
    """Re-encode MUR CSVs to UTF-8.

    The portal publishes a mix of UTF-8, ISO-8859-1 and Windows-1252 files (the
    latter with curly apostrophes in 0x80-0x9F that Latin-1 cannot decode).
    """
    out_dir = S.INTERIM / "mur"
    out_dir.mkdir(parents=True, exist_ok=True)
    detected = {}
    for path in sorted((S.RAW / "mur").glob("*.csv")):
        raw = path.read_bytes()
        for encoding in ("utf-8", "cp1252", "latin-1"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        (out_dir / path.name).write_text(text.lstrip("\ufeff"), encoding="utf-8")
        detected[path.name] = encoding
    return detected


def parse_field_groups() -> pd.DataFrame:
    df = pd.read_excel(S.RAW / "mur" / "field_groups.xlsx")
    return pd.DataFrame({
        "field_code": df["Codice"].astype(int),
        "field_name": df["Nome Gruppo Disciplinare"].str.strip(),
        "isced_f": df["Codice ISCED_F"].astype(str).str.strip(),
        "field_area": df["Area Disciplinare"].str.strip(),
    })


# --- ISTAT municipalities ----------------------------------------------------

def parse_istat_comuni() -> pd.DataFrame:
    data = json.loads((S.RAW / "istat" / "comuni.json").read_text())["resultset"]
    df = pd.DataFrame(data)
    return pd.DataFrame({
        "comune_code": df["PRO_COM"].astype(int),
        "comune_name": df["COMUNE_IT"],
        "province_name": df["DEN_UTS"],
        "province_code": df["SIGLA_AUTOMOBILISTICA"],
        "region_code": df["COD_REG"],
        "region_name": df["DEN_REG"],
        "macro_area": df["DEN_RIP"],
    })


def main() -> None:
    S.INTERIM.mkdir(parents=True, exist_ok=True)
    for name, encoding in normalise_mur().items():
        print(f"  mur/{name:<32} re-encoded from {encoding}")
    outputs = {
        "almalaurea.csv": parse_almalaurea(),
        "omi_rents.csv": parse_omi(),
        "istat_comuni.csv": parse_istat_comuni(),
        "field_groups.csv": parse_field_groups(),
    }
    for code in S.EUROSTAT_DATASETS:
        outputs[f"eurostat_{code}.csv"] = parse_eurostat(code)
    for name, df in outputs.items():
        df.to_csv(S.INTERIM / name, index=False)
        print(f"  {name:<36} {len(df):>8,} rows")


if __name__ == "__main__":
    main()
