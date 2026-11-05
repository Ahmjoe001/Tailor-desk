-- Add an independent sewing-progress stage to existing orders.
-- Existing order status and payment fields remain unchanged.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.orders') IS NULL THEN
        RAISE EXCEPTION 'Expected public.orders was not found. No changes were applied.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
            AND column_name = 'id'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
            AND column_name = 'tailor_id'
    ) THEN
        RAISE EXCEPTION 'public.orders is missing expected ownership columns. No changes were applied.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
            AND column_name = 'progress_stage'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
            AND column_name = 'progress_stage'
            AND data_type IN ('text', 'character varying')
    ) THEN
        RAISE EXCEPTION 'Existing public.orders.progress_stage is not text/varchar. Review the live schema first.';
    END IF;
END;
$preflight$;

DO $add_progress_stage$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
            AND column_name = 'progress_stage'
    ) THEN
        ALTER TABLE public.orders
            ADD COLUMN progress_stage text NOT NULL DEFAULT 'order_received';

        UPDATE public.orders
        SET progress_stage = CASE lower(COALESCE(status::text, 'pending'))
            WHEN 'in_progress' THEN 'sewing_in_progress'
            WHEN 'completed' THEN 'ready_for_collection'
            WHEN 'collected' THEN 'collected'
            ELSE 'order_received'
        END;
    END IF;
END;
$add_progress_stage$;

DO $constraint$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.orders'::regclass
            AND conname = 'orders_progress_stage_check'
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_progress_stage_check
            CHECK (progress_stage IN (
                'order_received',
                'measurement_completed',
                'cutting',
                'sewing_in_progress',
                'finishing',
                'ready_for_collection',
                'collected'
            ));
    END IF;
END;
$constraint$;

CREATE INDEX IF NOT EXISTS orders_tailor_progress_stage_idx
    ON public.orders (tailor_id, progress_stage);

COMMENT ON COLUMN public.orders.progress_stage IS
    'Sewing workflow stage, independent of order status and payment completion.';

COMMIT;
