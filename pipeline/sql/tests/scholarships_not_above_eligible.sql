-- A university cannot award more scholarships than it has eligible students.
select ateneo_code, scholarship_eligible, scholarships_awarded
from core.fct_university_support
where scholarships_awarded > scholarship_eligible;
