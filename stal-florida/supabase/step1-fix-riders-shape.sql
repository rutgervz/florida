-- Step 1 data fix (C4) — applied to production 2026-06-11
--
-- Historically the booking API stored riders with JSON.stringify(...) into the jsonb
-- `riders` column, producing a JSON *string* scalar instead of an array. 19 rows were
-- affected. The confirmation email and confirmation page crashed on those rows.
--
-- The code fix (reserve route now passes the array directly, plus a shared parseRiders
-- helper on every read path) prevents new occurrences. This statement normalizes the
-- existing rows: it extracts the string's text content and re-parses it as jsonb.
--
-- Guarded so it only touches rows that are currently a string AND convert to an array.
-- Rollback: full pre-change copy in florida-backups/2026-06-11-pre-step1/reservations.json

UPDATE reservations
SET riders = (riders #>> '{}')::jsonb
WHERE jsonb_typeof(riders) = 'string'
  AND jsonb_typeof((riders #>> '{}')::jsonb) = 'array';
