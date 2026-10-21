-- =============================================================================
-- STAGING: one view per source file. Only renaming, typing and light cleaning
-- (trimming padded codes, Italian decimal commas, empty strings -> NULL).
-- No business logic lives here.
-- =============================================================================

create schema if not exists stg;

-- Italian-formatted numbers ("2160,32", "1.285") -> DOUBLE
create or replace macro it_num(x) as
    try_cast(replace(replace(nullif(trim(x), ''), '.', ''), ',', '.') as double);

-- Turn "Friuli- Venezia Giulia", "Valle d'Aosta/Vallée d'Aoste", "Nord-est" into
-- a comparable key: lower-case, part before '/', letters only.
create or replace macro geo_key(x) as
    regexp_replace(lower(split_part(x, '/', 1)), '[^a-z]', '', 'g');

-- ---------------------------------------------------------------- reference data

create or replace view stg.istat_comuni as
select * from read_csv('data/interim/istat_comuni.csv', header = true);

create or replace view stg.university_crosswalk as
select * from read_csv('data/seeds/university_crosswalk.csv', header = true,
                       types = {'ateneo_code': 'INTEGER', 'is_online': 'BOOLEAN'});

create or replace view stg.mur_universities as
select
    cast(COD_Ateneo as integer)           as ateneo_code,
    trim(NomeEsteso)                      as full_name,
    trim(NomeOperativo)                   as short_name,
    Status = 'A'                          as is_active,
    StataleLibera = 'S'                   as is_state,
    trim(Descrizione)                     as institution_type
from read_csv('data/interim/mur/universities.csv', delim = ';', all_varchar = true);

create or replace view stg.field_groups as
select * from read_csv('data/interim/field_groups.csv', header = true);

-- ---------------------------------------------------------------- MUR: fees

create or replace view stg.fees as
select
    replace(ANNO_ACCADEMICO, '-', '/')            as academic_year,
    cast(COD_Ateneo as integer)                   as ateneo_code,
    it_num(TASSA_MEDIA_PAGANTI_LAUREA)            as avg_fee_paying_students,
    it_num(TASSA_MEDIA_TOTALE_ISCRITTI_LAUREA)    as avg_fee_all_students
from read_csv('data/interim/mur/fees_avg.csv', delim = ';', all_varchar = true)
where regexp_matches(COD_Ateneo, '^\d+$');   -- drop national/state/private total rows

create or replace view stg.fee_exemptions as
select
    replace(ANNO_ACCADEMICO, '-', '/')            as academic_year,
    cast(COD_ATENEO as integer)                   as ateneo_code,
    trim(CODICE_ESONERO_TOTALE)                   as exemption_code,
    trim(DESCRIZIONE_ESONERO_TOTALE)              as exemption,
    coalesce(it_num(ESONERO_TOTALE_LAUREA), 0)    as students
from read_csv('data/interim/mur/fees_exemptions.csv', delim = ';', all_varchar = true);

-- ---------------------------------------------------------------- MUR: right to study (DSU)

create or replace view stg.dsu_interventions as
select
    replace(trim(ANNO_ACCADEMICO), '-', '/')      as academic_year,
    trim(NOME_REGIONE)                            as region_name,
    trim(NOME_ENTE)                               as agency,
    cast(CODICE_ISTITUTO as integer)              as institution_code,
    trim(TIPO_ISTITUTO)                           as institution_type,
    cast(CODICE_INTERVENTO as integer)            as measure_code,
    trim(DESCRIZIONE_INTERVENTO)                  as measure,
    coalesce(it_num(INTERVENTI_LAUREA), 0)        as value
from read_csv('data/interim/mur/dsu_interventions.csv', delim = ';', all_varchar = true);

create or replace view stg.dsu_spending as
select
    cast(trim(ANNO_SOLARE) as integer)            as calendar_year,
    cast(CODICE_ISTITUTO as integer)              as institution_code,
    trim(TIPO_ISTITUTO)                           as institution_type,
    cast(CODICE_SPESA as integer)                 as spending_code,
    trim(DESCRIZIONE_SPESA)                       as spending,
    coalesce(it_num(SPESA_LAUREA), 0)             as eur
from read_csv('data/interim/mur/dsu_spending.csv', delim = ';', all_varchar = true);

create or replace view stg.dsu_beds_by_comune as
select
    strptime(DATA, '%d/%m/%Y')::date              as reference_date,
    trim(NOME_REGIONE)                            as region_name,
    trim(NOME_COMUNE)                             as comune_upper,
    cast(NUMERO as integer)                       as beds
from read_csv('data/interim/mur/dsu_beds_by_comune.csv', delim = ';', all_varchar = true);

-- ---------------------------------------------------------------- MUR: students

create or replace view stg.enrolment_by_university as
select
    AnnoA                                         as academic_year,
    cast(AteneoCOD as integer)                    as ateneo_code,
    SESSO                                         as sex,
    cast(Iscritti as integer)                     as students
from read_csv('data/interim/mur/enrolled_by_university.csv', delim = ';', all_varchar = true);

create or replace view stg.enrolment_by_course as
select
    AnnoA                                         as academic_year,
    cast(AteneoCOD as integer)                    as ateneo_code,
    trim(ClasseNUMERO)                            as degree_class,
    trim(CorsoNOME)                               as course_name,
    try_cast(SedeC as integer)                    as course_comune_code,
    cast(GruppoCODICE as integer)                 as field_code,
    Sesso                                         as sex,
    cast(Iscritti as integer)                     as students
from read_csv('data/interim/mur/enrolled_by_course.csv', delim = ';', all_varchar = true);

create or replace view stg.intl_enrolment_by_university as
select
    AnnoA                                         as academic_year,
    cast(AteneoCOD as integer)                    as ateneo_code,
    cast(Iscritti_Internazionali as integer)      as intl_students
from read_csv('data/interim/mur/enrolled_intl_by_university.csv', delim = ';', all_varchar = true);

create or replace view stg.graduates_by_university as
select
    cast(AnnoS as integer)                        as calendar_year,
    cast(AteneoCOD as integer)                    as ateneo_code,
    SESSO                                         as sex,
    cast(Lau as integer)                          as graduates
from read_csv('data/interim/mur/graduates_by_university.csv', delim = ';', all_varchar = true);

-- ---------------------------------------------------------------- AlmaLaurea

-- Keep only the indicators the marts use, under stable English metric names.
create or replace view stg.almalaurea as
with mapped as (
    select *,
        case
            when indicator_group = 'Numero di laureati'                         then 'graduates'
            when indicator_group = 'Numero di intervistati'                     then 'respondents'
            when indicator_group = 'Tasso di occupazione' and indicator = 'Totale'
                                                                                then 'employment_rate'
            when indicator = 'Tasso di disoccupazione'                          then 'unemployment_rate'
            when indicator_group like 'Retribuzione mensile netta%' and indicator = 'Totale'
                                                                                then 'net_monthly_salary'
            when indicator = 'Tempo dalla laurea al reperimento del primo lavoro'
                                                                                then 'months_to_first_job'
            when indicator = 'Molto efficace/Efficace'                          then 'degree_effective_pct'
            when indicator = 'Soddisfazione per il lavoro svolto (medie, scala 1-10)'
                                                                                then 'job_satisfaction'
            when indicator_group like 'Ripartizione geografica di lavoro%' and indicator = 'Estero'
                                                                                then 'working_abroad_pct'
            when indicator = 'Tempo indeterminato'                              then 'permanent_contract_pct'
        end as metric
    from read_csv('data/interim/almalaurea.csv', header = true)
)
select survey_year, course_type, years_after, breakdown, entity, metric, value
from mapped
where metric is not null and value is not null;

-- ---------------------------------------------------------------- OMI rents

create or replace view stg.omi_rents as
select
    segment, level, area_name, geo_key(area_name) as area_key,
    contracts, avg_sqm, total_sqm, total_rent_eur_m * 1e6 as total_rent_eur,
    rent_eur_sqm_year, reference_year
from read_csv('data/interim/omi_rents.csv', header = true);

-- ---------------------------------------------------------------- Eurostat

create or replace view stg.eurostat_price_level as
select geo, cast(year as integer) as year, cast(value as double) as price_level_index, flag
from read_csv('data/interim/eurostat_prc_ppp_ind.csv', header = true, all_varchar = true)
where na_item = 'PLI_EU27_2020' and ppp_cat = 'A01';   -- A01 = actual individual consumption

create or replace view stg.eurostat_grad_employment as
select geo, cast(year as integer) as year, cast(value as double) as employment_rate_pct, flag
from read_csv('data/interim/eurostat_edat_lfse_24.csv', header = true, all_varchar = true)
where isced11 = 'ED5-8' and duration = 'Y1-3' and age = 'Y20-34' and sex = 'T';

create or replace view stg.eurostat_tertiary_attainment as
select geo, cast(year as integer) as year, cast(value as double) as tertiary_attainment_pct, flag
from read_csv('data/interim/eurostat_edat_lfse_03.csv', header = true, all_varchar = true)
where isced11 = 'ED5-8' and age = 'Y25-34' and sex = 'T';

create or replace view stg.eurostat_mobile_students as
select geo, cast(year as integer) as year, cast(value as double) as mobile_students, flag
from read_csv('data/interim/eurostat_educ_uoe_mobs02.csv', header = true, all_varchar = true)
where isced11 = 'ED5-8' and sex = 'T' and partner = 'WRL_X_REP' and unit = 'NR';

create or replace view stg.eurostat_tertiary_enrolment as
select geo, cast(year as integer) as year, cast(value as double) as students, flag
from read_csv('data/interim/eurostat_educ_uoe_enrt01.csv', header = true, all_varchar = true)
where isced11 = 'ED5-8' and sex = 'T' and sector = 'TOT_SEC' and worktime = 'TOTAL' and unit = 'NR';
