-- Every study city gets a rent reference for every OMI market segment.
select study_city
from core.dim_city
where rent_sqm_year_ord_long is null
   or rent_sqm_year_ord_short is null
   or rent_sqm_year_student_regulated is null;
