-- At least 80% of on-campus students attend a university with AlmaLaurea outcomes.
select sum(students) filter (has_outcomes_data) * 1.0 / sum(students) as coverage
from mart.university_profile
where not is_online
having coverage < 0.8;
