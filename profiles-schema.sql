CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_full_name text;
BEGIN
    v_full_name := COALESCE(
        NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
        'Tailor'
    );

    INSERT INTO public.profiles (id, full_name, shop_name)
    VALUES (NEW.id, v_full_name, COALESCE(
        NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'shop_name'), ''),
        v_full_name || '''s Tailoring'
    ))
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

CREATE TRIGGER on_auth_user_created_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_profile();

INSERT INTO public.profiles (id, full_name, shop_name)
SELECT users.id, names.full_name, COALESCE(
    NULLIF(BTRIM(users.raw_user_meta_data ->> 'shop_name'), ''),
    names.full_name || '''s Tailoring'
)
FROM auth.users AS users
CROSS JOIN LATERAL (
    SELECT COALESCE(
        NULLIF(BTRIM(users.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(SPLIT_PART(COALESCE(users.email, ''), '@', 1), ''),
        'Tailor'
    ) AS full_name
) AS names
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_tailor_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user auth.users%ROWTYPE;
    v_full_name text;
    v_profile_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'You must be signed in to verify a tailor profile.';
    END IF;

    SELECT *
    INTO v_user
    FROM auth.users
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The authenticated user account could not be found.';
    END IF;

    v_full_name := COALESCE(
        NULLIF(BTRIM(v_user.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(SPLIT_PART(COALESCE(v_user.email, ''), '@', 1), ''),
        'Tailor'
    );

    INSERT INTO public.profiles (id, full_name, shop_name)
    VALUES (
        v_user.id,
        v_full_name,
        COALESCE(
            NULLIF(BTRIM(v_user.raw_user_meta_data ->> 'shop_name'), ''),
            v_full_name || '''s Tailoring'
        )
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT id
    INTO v_profile_id
    FROM public.profiles
    WHERE id = v_user.id;

    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'A profile matching the authenticated user could not be verified.';
    END IF;

    RETURN v_profile_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_tailor_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_tailor_profile() TO authenticated;
