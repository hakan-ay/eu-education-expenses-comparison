-- Rents (EUR per m² per year) are positive and below any plausible Italian value.
select *
from core.omi_rent_reference
where rent_eur_sqm_year <= 10 or rent_eur_sqm_year > 400;
