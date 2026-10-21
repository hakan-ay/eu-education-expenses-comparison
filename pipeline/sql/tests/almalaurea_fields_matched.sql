-- Every AlmaLaurea field of study matches a MUR field group by name.
select distinct a.entity
from stg.almalaurea a
left join core.dim_field f on f.field_name = a.entity
where a.breakdown = 'gruppo' and a.entity <> 'ITALIA' and f.field_code is null;
