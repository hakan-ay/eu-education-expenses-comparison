-- Percentage metrics stay within 0-100.
select *
from core.fct_outcomes
where employment_rate not between 0 and 100
   or unemployment_rate not between 0 and 100
   or degree_effective_pct not between 0 and 100;
