-- Add optional customer photographs using the existing private image bucket.
-- Run only after reviewing the live schema audit and Storage policies.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.customers') IS NULL THEN
        RAISE EXCEPTION 'Expected public.customers was not found. No changes were applied.';
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

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customers'
            AND column_name = 'photo_path'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customers'
            AND column_name = 'photo_path' AND data_type IN ('text', 'character varying')
    ) THEN
        RAISE EXCEPTION 'Existing public.customers.photo_path is not text/varchar. Review the live schema first.';
    END IF;
END;
$preflight$;

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS photo_path text;

COMMIT;