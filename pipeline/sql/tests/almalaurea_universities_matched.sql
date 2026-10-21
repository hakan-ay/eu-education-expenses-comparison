-- Every university reported by AlmaLaurea is matched to a MUR code (no silent drops).
select distinct a.entity
from stg.almalaurea a
left join stg.university_crosswalk x on x.almalaurea_name = a.entity
where a.breakdown = 'ateneo' and a.entity <> 'ITALIA' and x.ateneo_code is null;
