-- City totals + online universities reconcile with the national enrolment total.
with national as (
    select sum(students) as n from core.fct_enrolment
    where academic_year = (select period from core.reference_periods where topic = 'enrolment')
),
modelled as (
    select (select sum(students) from mart.city_comparison)
         + (select coalesce(sum(students), 0) from mart.university_profile where is_online) as n
)
select national.n as national, modelled.n as modelled
from national, modelled
where abs(national.n - modelled.n) > 0;
