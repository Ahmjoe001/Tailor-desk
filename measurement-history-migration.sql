-- Preserve prior customer measurement-set versions before an update.
-- Current measurements remain in customer_measurement_sets; this table stores dated prior snapshots.
BEGIN;

DO $preflight$
DECLARE
    v_required record;
BEGIN
    FOR v_required IN
        SELECT * FROM (VALUES
            ('customer_measurement_sets', 'customer_id'),
            ('customer_measurement_sets', 'tailor_id'),
            ('customer_measurement_sets', 'measurements'),
            ('customer_measurement_sets', 'unit'),
            ('customer_measurement_sets', 'notes'),
            ('customer_measurement_sets', 'updated_at'),
            ('customers', 'id'),
            ('customers', 'tailor_id'),
            ('profiles', 'id')
        ) AS required(table_name, column_name)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
                AND table_name = v_required.table_name
                AND column_name = v_required.column_name
        ) THEN
            RAISE EXCEPTION 'Expected public.%.% was not found. No changes were applied.',
                v_required.table_name, v_required.column_name;
        END IF;
    END LOOP;

    IF to_regclass('public.customer_measurement_set_history') IS NOT NULL AND EXISTS (
        SELECT 1
        FROM (VALUES
            ('id'), ('customer_id'), ('tailor_id'), ('measurements'), ('unit'), ('notes'), ('recorded_at')
        ) AS required(column_name)
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
                AND table_name = 'customer_measurement_set_history'
                AND column_name = required.column_name
        )
    ) THEN
        RAISE EXCEPTION 'Existing public.customer_measurement_set_history has an unexpected shape. Review the live schema first.';
    END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.customer_measurement_set_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
    tailor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    measurements jsonb NOT NULL CHECK (jsonb_typeof(measurements) = 'object'),
    unit text NOT NULL CHECK (unit IN ('cm', 'in')),
    notes text,
    recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_measurement_history_customer_date_idx
    ON public.customer_measurement_set_history (tailor_id, customer_id, recorded_at DESC);

ALTER TABLE public.customer_measurement_set_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_measurement_set_history FROM PUBLIC, anon;
GRANT SELECT ON public.customer_measurement_set_history TO authenticated;

DO $policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'customer_measurement_set_history'
            AND policyname = 'TailorDesk measurement history owner access'
    ) THEN
        CREATE POLICY "TailorDesk measurement history owner access"
            ON public.customer_measurement_set_history
            AS PERMISSIVE FOR SELECT TO authenticated
            USING (
                tailor_id = (SELECT auth.uid())
                AND EXISTS (
                    SELECT 1 FROM public.customers AS customer
                    WHERE customer.id = customer_measurement_set_history.customer_id
                        AND customer.tailor_id = (SELECT auth.uid())
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'customer_measurement_set_history'
            AND policyname = 'TailorDesk measurement history owner boundary'
    ) THEN
        CREATE POLICY "TailorDesk measurement history owner boundary"
            ON public.customer_measurement_set_history
            AS RESTRICTIVE FOR SELECT TO public
            USING (
                tailor_id = (SELECT auth.uid())
                AND EXISTS (
                    SELECT 1 FROM public.customers AS customer
                    WHERE customer.id = customer_measurement_set_history.customer_id
                        AND customer.tailor_id = (SELECT auth.uid())
                )
            );
    END IF;
END;
$policies$;

CREATE OR REPLACE FUNCTION public.archive_customer_measurement_set_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF OLD.measurements IS DISTINCT FROM NEW.measurements
        OR OLD.unit IS DISTINCT FROM NEW.unit
        OR OLD.notes IS DISTINCT FROM NEW.notes THEN
        INSERT INTO public.customer_measurement_set_history (
            customer_id, tailor_id, measurements, unit, notes, recorded_at
        ) VALUES (
            OLD.customer_id, OLD.tailor_id, OLD.measurements, OLD.unit, OLD.notes, OLD.updated_at
        );
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_customer_measurement_set_version() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS archive_customer_measurement_set_version ON public.customer_measurement_sets;
CREATE TRIGGER archive_customer_measurement_set_version
    BEFORE UPDATE ON public.customer_measurement_sets
    FOR EACH ROW
    EXECUTE FUNCTION public.archive_customer_measurement_set_version();

COMMIT;
