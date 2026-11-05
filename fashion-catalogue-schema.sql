-- Add tailor-owned catalogue records using the existing private image bucket.
-- Run only after reviewing the live schema audit and confirming the bucket policies.
BEGIN;

DO $preflight$
DECLARE
    v_missing_column text;
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'Expected public.profiles was not found. No changes were applied.';
    END IF;

    IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
        RAISE EXCEPTION 'Supabase Storage is unavailable. No changes were applied.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM storage.buckets
        WHERE id = 'tailordesk-order-images' AND public IS FALSE
    ) THEN
        RAISE EXCEPTION 'The private tailordesk-order-images bucket was not found. Review the live Storage setup first.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
            AND policyname = 'TailorDesk image owners can read files'
            AND qual ILIKE '%auth.uid%' AND qual ILIKE '%foldername%'
            AND qual ILIKE '%tailordesk-order-images%'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
            AND policyname = 'TailorDesk image owners can upload files'
            AND with_check ILIKE '%auth.uid%' AND with_check ILIKE '%foldername%'
            AND with_check ILIKE '%tailordesk-order-images%'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
            AND policyname = 'TailorDesk image owners can delete files'
            AND qual ILIKE '%auth.uid%' AND qual ILIKE '%foldername%'
            AND qual ILIKE '%tailordesk-order-images%'
    ) THEN
        RAISE EXCEPTION 'Expected TailorDesk owner-scoped Storage policies were not found. Review live Storage policies first.';
    END IF;

    IF to_regclass('public.fashion_catalogue') IS NOT NULL THEN
        SELECT required.column_name INTO v_missing_column
        FROM (VALUES
            ('id'), ('tailor_id'), ('design_name'), ('category'),
            ('description'), ('price'), ('image_path'), ('created_at'), ('updated_at')
        ) AS required(column_name)
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns AS existing
            WHERE existing.table_schema = 'public'
                AND existing.table_name = 'fashion_catalogue'
                AND existing.column_name = required.column_name
        )
        LIMIT 1;

        IF v_missing_column IS NOT NULL THEN
            RAISE EXCEPTION 'Existing public.fashion_catalogue is missing %. Review the live schema before applying this migration.', v_missing_column;
        END IF;
    END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.fashion_catalogue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    design_name text NOT NULL CHECK (length(btrim(design_name)) BETWEEN 1 AND 150),
    category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 100),
    description text,
    price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    image_path text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fashion_catalogue_tailor_created_idx
    ON public.fashion_catalogue (tailor_id, created_at DESC);

ALTER TABLE public.fashion_catalogue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fashion_catalogue FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fashion_catalogue TO authenticated;

DO $policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'fashion_catalogue'
            AND policyname = 'TailorDesk catalogue owner access'
    ) THEN
        CREATE POLICY "TailorDesk catalogue owner access"
            ON public.fashion_catalogue
            AS PERMISSIVE FOR ALL TO authenticated
            USING (tailor_id = (SELECT auth.uid()))
            WITH CHECK (tailor_id = (SELECT auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'fashion_catalogue'
            AND policyname = 'TailorDesk catalogue owner boundary'
    ) THEN
        CREATE POLICY "TailorDesk catalogue owner boundary"
            ON public.fashion_catalogue
            AS RESTRICTIVE FOR ALL TO public
            USING (tailor_id = (SELECT auth.uid()))
            WITH CHECK (tailor_id = (SELECT auth.uid()));
    END IF;
END;
$policies$;

COMMIT;