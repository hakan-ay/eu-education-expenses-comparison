-- Every seat municipality in the crosswalk exists in the ISTAT register.
select x.ateneo_code, x.istat_comune
from stg.university_crosswalk x
left join stg.istat_comuni c on c.comune_name = x.istat_comune
where c.comune_name is null;
