-- Step 1 security fix (C1, C2, C3) — applied to production 2026-06-11
--
-- Removes overly-permissive public RLS policies that allowed anyone holding the
-- public anon key (shipped in the browser bundle) to:
--   C1  read every reservation, including full customer PII and rider data
--   C2  insert reservations directly, forging "confirmed" bookings and bypassing payment
--   C3  read the guides table, including phone numbers
--
-- Safe because all application database access uses the service-role client
-- (lib/supabase.ts -> supabaseAdmin), which bypasses RLS. No code path uses the
-- anon `supabase` client. RLS remains enabled on all tables, so with these
-- policies removed the anon/authenticated roles are denied by default.
--
-- Rollback: re-create the dropped policies (see the exact prior definitions in
-- florida-backups/2026-06-11-pre-step1/policies-CURRENT.sql).

DROP POLICY IF EXISTS "Public can view own reservations" ON public.reservations;
DROP POLICY IF EXISTS "Public can create reservations" ON public.reservations;
DROP POLICY IF EXISTS "Public can view active guides" ON public.guides;

-- M1: the guide_assignments table allowed the public anon key to read, insert, and
-- delete staffing rows directly, so anyone could wipe or pollute the guide schedule.
-- The app uses the service-role client for this table.
DROP POLICY IF EXISTS "Public can create assignments" ON public.guide_assignments;
DROP POLICY IF EXISTS "Public can delete assignments" ON public.guide_assignments;
DROP POLICY IF EXISTS "Public can view assignments"   ON public.guide_assignments;
