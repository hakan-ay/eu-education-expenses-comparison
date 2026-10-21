-- Average fees are between 0 and 20,000 EUR, and the paying-students average is
-- never below the all-students average (exempt students pay 0).
select *
from stg.fees
where avg_fee_paying_students not between 0 and 20000
   or avg_fee_all_students > avg_fee_paying_students + 0.01;
