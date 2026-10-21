-- Each MUR university code appears once in the hand-maintained crosswalk.
select ateneo_code, count(*) as n
from stg.university_crosswalk
group by ateneo_code
having count(*) > 1;
