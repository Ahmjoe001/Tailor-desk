-- Add authenticated, self-scoped profile settings RPCs.
-- This migration does not alter tables, rows, RLS, or authentication settings.
-- It expects only the columns already referenced by profiles-schema.sql.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'Expected public.profiles was not found; inspect the actual schema before applying this migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
            AND column_name = 'id' AND udt_name = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
            AND column_name = 'full_name' AND data_type IN ('text', 'character varying')
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
            AND column_name = 'shop_name' AND data_type IN ('text', 'character varying')
    ) THEN
        RAISE EXCEPTION 'public.profiles must have id uuid, full_name text/varchar, and shop_name text/varchar; no changes were applied.';
    END IF;
END;
$preflight$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TailorDesk profiles own access" ON public.profiles;
CREATE POLICY "TailorDesk profiles own access"
    ON public.profiles
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "TailorDesk profiles owner boundary" ON public.profiles;
CREATE POLICY "TailorDesk profiles owner boundary"
    ON public.profiles
    AS RESTRICTIVE
    FOR ALL
    TO public
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

GRANT SELECT, UPDATE ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_tailor_profile()
RETURNS TABLE (full_name text, shop_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be signed in to view profile settings.';
    END IF;

    RETURN QUERY
    SELECT profile.full_name::text, profile.shop_name::text
    FROM public.profiles AS profile
    WHERE profile.id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A profile for the signed-in user could not be found.';
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_tailor_profile(
    p_full_name text,
    p_shop_name text
)
RETURNS TABLE (full_name text, shop_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_full_name text := NULLIF(BTRIM(COALESCE(p_full_name, '')), '');
    v_shop_name text := NULLIF(BTRIM(COALESCE(p_shop_name, '')), '');
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be signed in to update profile settings.';
    END IF;

    IF v_full_name IS NULL OR v_shop_name IS NULL THEN
        RAISE EXCEPTION 'Your name and business name are required.';
    END IF;

    RETURN QUERY
    UPDATE public.profiles AS profile
    SET full_name = v_full_name,
        shop_name = v_shop_name
    WHERE profile.id = v_user_id
    RETURNING profile.full_name::text, profile.shop_name::text;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A profile for the signed-in user could not be found.';
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_tailor_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_tailor_profile(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_tailor_profile() FROM anon;
REVOKE ALL ON FUNCTION public.update_my_tailor_profile(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_tailor_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_tailor_profile(text, text) TO authenticated;

COMMIT;
