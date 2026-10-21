-- =============================================================================
-- CORE: conformed dimensions and facts. This is where sources are joined and
-- business rules (reference years, rent fallbacks, weighting) are applied.
-- =============================================================================

create schema if not exists core;

-- Reference periods used throughout (latest *final* data for each source).
create or replace table core.reference_periods as
select * from (values
    ('enrolment',     '2024/2025', 'MUR/USTAT; 2025/26 is provisional'),
    ('fees',          '2023/2024', 'MUR contribuzione studentesca, 2024 release'),
    ('scholarships',  '2023/2024', 'MUR DSU survey, 2024 release'),
    ('outcomes',      '2025',      'AlmaLaurea survey of 2024 (1y) and 2020 (5y) graduates'),
    ('rents',         '2025',      'Agenzia Entrate OMI, contracts registered in 2025')
) t(topic, period, note);

-- ---------------------------------------------------------------- dimensions

create or replace table core.dim_field as
select field_code, field_name, field_area, isced_f
from stg.field_groups
where field_code <> 99;

create or replace table core.dim_university as
select
    x.ateneo_code,
    u.short_name                                         as university,
    u.full_name,
    u.institution_type,
    u.is_state,
    x.is_online,
    x.study_city,
    c.region_name,
    c.macro_area,
    x.almalaurea_name,
    x.note
from stg.university_crosswalk x
join stg.mur_universities u using (ateneo_code)
join stg.istat_comuni c on c.comune_name = x.istat_comune;

-- One row per study city with its housing-cost reference.
-- OMI publishes rents for 8 large cities and 19 regions. Regional averages are
-- dominated by their big city (Milan is ~23% of Lombardy's rented floor area), so
-- other cities get the region *excluding* its big city:
--     (region rent total - big-city rent total) / (region m² - big-city m²)
-- Trentino-Alto Adige is not covered by OMI (different land registry), so it
-- falls back to its macro-area (Nord-Est).
create or replace table core.omi_rent_reference as
with big_city_region as (
    select r.segment, c.region_name, r.total_rent_eur, r.total_sqm
    from stg.omi_rents r
    join stg.istat_comuni c on r.level = 'city' and geo_key(c.comune_name) = r.area_key
)
select r.segment, 'region_excl_city' as level, r.area_key,
       (r.total_rent_eur - b.total_rent_eur) / (r.total_sqm - b.total_sqm) as rent_eur_sqm_year
from stg.omi_rents r
join big_city_region b on r.level = 'region' and r.segment = b.segment and r.area_key = geo_key(b.region_name)
union all
select segment, level, area_key, rent_eur_sqm_year from stg.omi_rents;

create or replace table core.dim_city as
with cities as (
    select study_city, any_value(region_name) as region_name, any_value(macro_area) as macro_area
    from core.dim_university
    where not is_online
    group by study_city
),
rent_candidates as (
    select c.study_city, r.segment, r.rent_eur_sqm_year, r.level as rent_source_level,
           case r.level when 'city' then 1 when 'region_excl_city' then 2
                        when 'region' then 3 when 'area' then 4 end as priority
    from cities c
    join core.omi_rent_reference r
      on (r.level = 'city'                          and r.area_key = geo_key(c.study_city))
      or (r.level in ('region_excl_city', 'region') and r.area_key = geo_key(c.region_name))
      or (r.level = 'area'                          and r.area_key = geo_key(c.macro_area))
),
best as (
    select * from rent_candidates
    qualify row_number() over (partition by study_city, segment order by priority) = 1
)
select
    c.*,
    max(rent_eur_sqm_year) filter (segment = 'ORD_L') as rent_sqm_year_ord_long,
    max(rent_eur_sqm_year) filter (segment = 'ORD_T') as rent_sqm_year_ord_short,
    max(rent_eur_sqm_year) filter (segment = 'AGE_T') as rent_sqm_year_student_regulated,
    max(rent_source_level) filter (segment = 'ORD_L') as rent_source_level
from cities c
left join best b using (study_city)
group by all;

-- ---------------------------------------------------------------- facts

-- Students per university and year (sum over sex).
create or replace table core.fct_enrolment as
select academic_year, ateneo_code,
       sum(students)                               as students,
       sum(students) filter (sex = 'F')            as female_students
from stg.enrolment_by_university
group by all;

-- Students per university x field x course location, latest final year.
create or replace table core.fct_enrolment_field as
select e.ateneo_code, e.field_code, sum(e.students) as students
from stg.enrolment_by_course e
where e.academic_year = (select period from core.reference_periods where topic = 'enrolment')
group by all;

-- Costs and student support per university.
create or replace table core.fct_university_support as
with dsu as (
    -- An institution can be served by more than one regional agency: sum them.
    select institution_code as ateneo_code,
        sum(value) filter (measure_code = 1)  as scholarship_applications,
        sum(value) filter (measure_code = 2)  as scholarship_eligible,
        sum(value) filter (measure_code = 3)  as scholarships_awarded,
        sum(value) filter (measure_code = 13) as housing_applications,
        sum(value) filter (measure_code = 14) as housing_places_assigned
    from stg.dsu_interventions
    where institution_type = 'Ateneo'
    group by all
),
spend as (
    select institution_code as ateneo_code, sum(eur) as scholarship_spend_eur
    from stg.dsu_spending
    where institution_type = 'Ateneo' and spending_code = 1
    group by all
),
no_tax as (
    -- Students fully exempt because family income (ISEE) is under the no-tax threshold.
    select ateneo_code, sum(students) as no_tax_area_students
    from stg.fee_exemptions
    where exemption_code in ('16', '17', '18')
    group by all
)
select
    f.ateneo_code,
    f.avg_fee_paying_students,
    f.avg_fee_all_students,
    n.no_tax_area_students,
    -- Some agencies (e.g. Veneto ESUs) report all-zero rows for universities that
    -- manage scholarships themselves: zero applications means "not reported".
    nullif(d.scholarship_applications, 0)                              as scholarship_applications,
    case when d.scholarship_applications > 0 then d.scholarship_eligible end as scholarship_eligible,
    case when d.scholarship_applications > 0 then d.scholarships_awarded end as scholarships_awarded,
    s.scholarship_spend_eur,
    s.scholarship_spend_eur / nullif(d.scholarships_awarded, 0) as avg_scholarship_eur,
    d.housing_applications,
    d.housing_places_assigned
from stg.fees f
left join dsu d using (ateneo_code)
left join spend s using (ateneo_code)
left join no_tax n using (ateneo_code);

-- Graduate outcomes, one row per entity x cohort, metrics as columns.
create or replace table core.fct_outcomes as
pivot (
    select breakdown, entity, course_type, years_after, metric, value from stg.almalaurea
)
on metric in ('graduates', 'respondents', 'employment_rate', 'unemployment_rate',
              'net_monthly_salary', 'months_to_first_job', 'degree_effective_pct',
              'job_satisfaction', 'working_abroad_pct', 'permanent_contract_pct')
using first(value);

create or replace table core.fct_outcomes_university as
select u.ateneo_code, o.* exclude (breakdown, entity)
from core.fct_outcomes o
join core.dim_university u on u.almalaurea_name = o.entity
where o.breakdown = 'ateneo';

create or replace table core.fct_outcomes_field as
select f.field_code, o.* exclude (breakdown, entity)
from core.fct_outcomes o
join core.dim_field f on f.field_name = o.entity
where o.breakdown = 'gruppo';

create or replace table core.fct_outcomes_national as
select o.* exclude (breakdown, entity)
from core.fct_outcomes o
where o.breakdown = 'ateneo' and o.entity = 'ITALIA';

-- Publicly funded student beds (DSU) per study city.
create or replace table core.fct_city_beds as
select c.study_city, sum(b.beds) as dsu_beds
from core.dim_city c
join stg.dsu_beds_by_comune b
  on b.comune_upper in (
      select upper(x.istat_comune) from stg.university_crosswalk x where x.study_city = c.study_city
      union select upper(c.study_city))
group by all;

-- ---------------------------------------------------------------- EU context

create or replace table core.fct_eu_country_year as
select geo, year,
       p.price_level_index,
       g.employment_rate_pct  as recent_grad_employment_pct,
       a.tertiary_attainment_pct,
       m.mobile_students / nullif(e.students, 0) * 100 as inbound_mobile_students_pct,
       e.students            as tertiary_students
from (select distinct geo, year from stg.eurostat_price_level where year >= 2015) k
left join stg.eurostat_price_level p using (geo, year)
left join stg.eurostat_grad_employment g using (geo, year)
left join stg.eurostat_tertiary_attainment a using (geo, year)
left join stg.eurostat_mobile_students m using (geo, year)
left join stg.eurostat_tertiary_enrolment e using (geo, year);
