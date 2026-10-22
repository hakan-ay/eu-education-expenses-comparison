-- =============================================================================
-- MACROS shared by every layer. Kept apart from staging so a CI build from the
-- committed snapshot (see build.py --from-snapshot) can define them too.
-- =============================================================================

-- Italian-formatted numbers ("2160,32", "1.285") -> DOUBLE
create or replace macro it_num(x) as
    try_cast(replace(replace(nullif(trim(x), ''), '.', ''), ',', '.') as double);

-- Turn "Friuli- Venezia Giulia", "Valle d'Aosta/Vallée d'Aoste", "Nord-est" into
-- a comparable key: lower-case, part before '/', letters only.
create or replace macro geo_key(x) as
    regexp_replace(lower(split_part(x, '/', 1)), '[^a-z]', '', 'g');
