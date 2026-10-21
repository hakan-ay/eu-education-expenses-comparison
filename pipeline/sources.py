"""Catalogue of every external source the pipeline reads.

Each entry is declarative so the README, the extractor and the data-quality
report all describe the same thing.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
SEEDS = ROOT / "data" / "seeds"
WAREHOUSE = ROOT / "data" / "warehouse.duckdb"
WEB_DATA = ROOT / "web" / "public" / "data"

USER_AGENT = "edu-cost-dashboard/1.0 (open-data portfolio project)"

# --- MUR / USTAT open-data portal (CKAN) -------------------------------------
# Resources are resolved by dataset + a substring of the resource name, because
# the portal renames files when it publishes corrections ("..._rett20260626.csv").
MUR_CKAN = "https://dati-ustat.mur.gov.it/api/3/action/package_show?id={package}"
MUR_RESOURCES = {
    # name in data/raw/mur/  : (CKAN package, resource-name substring)
    "fees_avg.csv": ("2024-contribuzione-e-interventi-atenei", "Contribuzione media"),
    "fees_exemptions.csv": ("2024-contribuzione-e-interventi-atenei", "Esonero totale"),
    "dsu_interventions.csv": ("2024-diritto-allo-studio-universitario-dsu-regionale", "Numero di interventi"),
    "dsu_spending.csv": ("2024-diritto-allo-studio-universitario-dsu-regionale", "Spesa per interventi"),
    "dsu_beds_by_comune.csv": ("2024-diritto-allo-studio-universitario-dsu-regionale", "Alloggi per comune"),
    "enrolled_by_university.csv": ("iscritti", "Iscritti per ateneo"),
    "enrolled_by_course.csv": ("iscritti", "Iscritti per corso di studi - a.a. 2019/20"),
    "enrolled_intl_by_university.csv": ("iscritti", "Iscritti internazionali per ateneo"),
    "graduates_by_university.csv": ("laureati", "Laureati per ateneo."),
    "universities.csv": ("metadati", "Atenei"),
    "field_groups.xlsx": ("metadati", "Gruppi disciplinari"),
}

# --- AlmaLaurea graduate employment survey ----------------------------------
# One HTML page per (course type, years since graduation, breakdown).
ALMALAUREA_URL = (
    "https://www2.almalaurea.it/cgi-php/universita/statistiche/visualizza.php"
    "?anno={year}&corstipo={course_type}&ateneo=tutti&facolta=tutti&gruppo=tutti"
    "&pa=tutti&classe=tutti&postcorso=tutti&isstella=0&annolau={years_after}"
    "&condocc=tutti&iscrls=tutti&disaggregazione={breakdown}&LANG=it&CONFIG=occupazione"
)
ALMALAUREA_SURVEY_YEAR = 2025
ALMALAUREA_COURSE_TYPES = {
    "L": "Bachelor (laurea triennale)",
    "LS": "Master (laurea magistrale biennale)",
    "LSE": "Single-cycle master (laurea magistrale a ciclo unico)",
}
# (course type, years after graduation) combinations AlmaLaurea publishes.
ALMALAUREA_COHORTS = [("L", 1), ("LS", 1), ("LS", 5), ("LSE", 1), ("LSE", 5)]
ALMALAUREA_BREAKDOWNS = ["ateneo", "gruppo"]

# --- Agenzia delle Entrate, OMI residential report (rents) ------------------
OMI_REPORT_URL = (
    "https://www.agenziaentrate.gov.it/portale/documents/20143/263076/"
    "RI2026_Residenziale20260521.pdf/892125df-86a3-c21a-f8a1-86323f45ae93"
)
OMI_REPORT_YEAR = 2025  # rents registered during calendar year 2025

# --- ISTAT SITUAS: official list of municipalities ---------------------------
ISTAT_COMUNI_URL = "https://situas-servizi.istat.it/publish/reportspooljson?pfun=61&pdata=01/01/2026"

# --- Eurostat (bulk SDMX TSV) ------------------------------------------------
EUROSTAT_URL = "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/{code}?format=TSV&compressed=true"
EUROSTAT_DATASETS = {
    "prc_ppp_ind": "Price level indices (EU27_2020 = 100)",
    "edat_lfse_24": "Employment rates of young people not in education, by attainment and years since completion",
    "edat_lfse_03": "Population by educational attainment level (25-34, tertiary)",
    "educ_uoe_mobs02": "Share of mobile students from abroad",
    "educ_uoe_enrt01": "Pupils and students enrolled by education level",
}
