-- Every active university in the MUR registry is mapped in the crosswalk.
select u.ateneo_code, u.short_name
from stg.mur_universities u
left join stg.university_crosswalk x using (ateneo_code)
where u.is_active and x.ateneo_code is null;
