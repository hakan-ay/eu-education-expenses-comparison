-- =============================================================================
-- MARTS: one table per dashboard view. Every number shown on the website comes
-- from exactly one of these tables (exported to web/public/data/*.json).
-- Every mart has an ORDER BY so the exported JSON is stable and diffs stay readable.
-- =============================================================================

create schema if not exists mart;

-- ---------------------------------------------------------------- universities

create or replace table mart.university_profile as
with latest as (select period from core.reference_periods where topic = 'enrolment'),
enrol as (
    select e.ateneo_code, e.students, e.female_students, i.intl_students
    from core.fct_enrolment e
    left join stg.intl_enrolment_by_university i
      on i.ateneo_code = e.ateneo_code and i.academic_year = e.academic_year
    where e.academic_year = (select period from latest)
),
enrol_5y_ago as (
    select ateneo_code, students as students_5y_ago
    from core.fct_enrolment where academic_year = '2019/2020'
),
outcomes as (
    select ateneo_code,
        max(employment_rate)    filter (course_type = 'L'  and years_after = 1) as employment_rate_bachelor_1y,
        max(employment_rate)    filter (course_type = 'LS' and years_after = 1) as employment_rate_master_1y,
        max(employment_rate)    filter (course_type = 'LS' and years_after = 5) as employment_rate_master_5y,
        max(net_monthly_salary) filter (course_type = 'LS' and years_after = 1) as net_salary_master_1y,
        max(net_monthly_salary) filter (course_type = 'LS' and years_after = 5) as net_salary_master_5y,
        max(respondents)        filter (course_type = 'LS' and years_after = 1) as respondents_master_1y,
        max(respondents)        filter (course_type = 'LS' and years_after = 5) as respondents_master_5y,
        max(degree_effective_pct) filter (course_type = 'LS' and years_after = 5) as degree_effective_pct_master_5y
    from core.fct_outcomes_university
    group by all
)
select
    u.ateneo_code, u.university, u.full_name, u.study_city, u.region_name, u.macro_area,
    u.is_state, u.is_online, u.institution_type,
    e.students,
    round(100.0 * e.female_students / e.students, 1)                  as female_pct,
    e.intl_students,
    round(100.0 * e.intl_students / e.students, 1)                    as intl_pct,
    round(100.0 * (e.students - p.students_5y_ago) / p.students_5y_ago, 1) as students_change_5y_pct,
    round(s.avg_fee_paying_students)                                  as avg_fee_paying_eur,
    round(s.avg_fee_all_students)                                     as avg_fee_all_eur,
    s.scholarship_eligible,
    s.scholarships_awarded,
    round(100.0 * s.scholarships_awarded / nullif(s.scholarship_eligible, 0), 1) as scholarship_coverage_pct,
    round(s.avg_scholarship_eur)                                      as avg_scholarship_eur,
    s.housing_places_assigned,
    o.* exclude (ateneo_code),
    u.almalaurea_name is not null                                     as has_outcomes_data,
    u.note
from core.dim_university u
left join enrol e using (ateneo_code)
left join enrol_5y_ago p using (ateneo_code)
left join core.fct_university_support s using (ateneo_code)
left join outcomes o using (ateneo_code)
where e.students > 0
order by u.university;

-- ---------------------------------------------------------------- cities

-- Weighted averages: fees by students, outcomes by AlmaLaurea respondents.
create or replace table mart.city_comparison as
with u as (select * from mart.university_profile where not is_online),
base as (
select
    c.study_city,
    c.region_name,
    c.macro_area,
    count(*)                                                           as universities,
    count(*) filter (u.is_state)                                       as state_universities,
    sum(u.students)                                                    as students,
    round(100.0 * sum(u.intl_students) / sum(u.students), 1)           as intl_pct,
    round(coalesce(sum(u.students) filter (not u.is_state), 0) * 100.0 / sum(u.students), 1) as private_share_pct,
    -- Fees
    round(sum(u.avg_fee_paying_eur * u.students) filter (u.is_state)
        / sum(u.students) filter (u.is_state and u.avg_fee_paying_eur is not null)) as avg_fee_state_eur,
    round(sum(u.avg_fee_paying_eur * u.students)
        / sum(u.students) filter (u.avg_fee_paying_eur is not null))   as avg_fee_all_eur,
    min(u.avg_fee_paying_eur) filter (u.is_state)                      as min_fee_state_eur,
    -- Housing cost (OMI, €/m² per year of registered contracts)
    round(c.rent_sqm_year_ord_long, 1)                                 as rent_sqm_year,
    round(c.rent_sqm_year_ord_short, 1)                                as rent_sqm_year_short_term,
    c.rent_source_level,
    -- Graduate outcomes (master's degree, AlmaLaurea)
    round(sum(u.employment_rate_master_1y * u.respondents_master_1y)
        / sum(u.respondents_master_1y) filter (u.employment_rate_master_1y is not null), 1) as employment_rate_master_1y,
    round(sum(u.employment_rate_master_5y * u.respondents_master_5y)
        / sum(u.respondents_master_5y) filter (u.employment_rate_master_5y is not null), 1) as employment_rate_master_5y,
    round(sum(u.net_salary_master_1y * u.respondents_master_1y)
        / sum(u.respondents_master_1y) filter (u.net_salary_master_1y is not null))         as net_salary_master_1y,
    round(sum(u.net_salary_master_5y * u.respondents_master_5y)
        / sum(u.respondents_master_5y) filter (u.net_salary_master_5y is not null))         as net_salary_master_5y,
    round(100.0 * sum(u.students) filter (u.has_outcomes_data) / sum(u.students), 1)       as outcomes_coverage_pct,
    -- Student support
    round(100.0 * sum(u.scholarships_awarded) / nullif(sum(u.scholarship_eligible), 0), 1) as scholarship_coverage_pct,
    round(sum(u.avg_scholarship_eur * u.scholarships_awarded) / nullif(sum(u.scholarships_awarded), 0)) as avg_scholarship_eur,
    b.dsu_beds,
    round(100.0 * b.dsu_beds / sum(u.students), 2)                     as dsu_beds_per_100_students
from core.dim_city c
join u using (study_city)
left join core.fct_city_beds b using (study_city)
group by c.study_city, c.region_name, c.macro_area, c.rent_sqm_year_ord_long,
         c.rent_sqm_year_ord_short, c.rent_source_level, b.dsu_beds
)
select
    *,
    -- Fee used in the cost model: public universities where the city has one.
    coalesce(avg_fee_state_eur, avg_fee_all_eur) as reference_fee_eur,
    avg_fee_state_eur is null                    as reference_fee_is_private
from base
order by students desc;

create or replace table mart.city_enrolment_trend as
select u.study_city, e.academic_year, sum(e.students) as students
from core.fct_enrolment e
join core.dim_university u using (ateneo_code)
where not u.is_online and e.academic_year >= '2015/2016'
  and e.academic_year <= (select period from core.reference_periods where topic = 'enrolment')
group by all
order by study_city, academic_year;

-- ---------------------------------------------------------------- fields of study

create or replace table mart.field_outcomes as
select
    f.field_code, f.field_name, f.field_area,
    case o.course_type when 'L' then 'bachelor' when 'LS' then 'master' when 'LSE' then 'single_cycle' end as degree,
    o.years_after,
    o.graduates, o.respondents,
    o.employment_rate, o.unemployment_rate, o.net_monthly_salary,
    o.months_to_first_job, o.degree_effective_pct, o.job_satisfaction,
    o.working_abroad_pct, o.permanent_contract_pct
from core.fct_outcomes_field o
join core.dim_field f using (field_code)
order by f.field_code, o.course_type, o.years_after;

create or replace table mart.city_field_enrolment as
select u.study_city, f.field_code, f.field_name, sum(e.students) as students
from core.fct_enrolment_field e
join core.dim_university u using (ateneo_code)
join core.dim_field f using (field_code)
where not u.is_online
group by all
order by study_city, field_code;

-- ---------------------------------------------------------------- EU context

create or replace table mart.eu_country_latest as
with long as (
    unpivot core.fct_eu_country_year
    on price_level_index, recent_grad_employment_pct, tertiary_attainment_pct, inbound_mobile_students_pct
    into name indicator value value
)
select geo, indicator, arg_max(value, year) as value, max(year) as year
from long
where value is not null
group by all
order by geo, indicator;

create or replace table mart.eu_country_series as
select geo, year, price_level_index, recent_grad_employment_pct,
       tertiary_attainment_pct, round(inbound_mobile_students_pct, 2) as inbound_mobile_students_pct
from core.fct_eu_country_year
order by geo, year;
