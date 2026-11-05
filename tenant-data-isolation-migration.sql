-- Add tenant-scoped RLS boundaries without changing or deleting application data.
-- Review supabase-schema-audit.sql results before and after applying this migration.
BEGIN;

DO $preflight$
DECLARE
    v_required record;
BEGIN
    FOR v_required IN
        SELECT * FROM (VALUES
            ('profiles', 'id'),
            ('customers', 'id'),
            ('customers', 'tailor_id'),
            ('measurements', 'id'),
            ('measurements', 'tailor_id'),
            ('measurements', 'customer_id'),
            ('customer_measurement_sets', 'customer_id'),
            ('customer_measurement_sets', 'tailor_id'),
            ('customer_measurement_sets', 'measurements'),
            ('customer_measurement_sets', 'unit'),
            ('customer_measurement_sets', 'notes'),
            ('customer_measurement_sets', 'updated_at'),
            ('orders', 'id'),
            ('orders', 'tailor_id'),
            ('orders', 'customer_id'),
            ('payments', 'tailor_id'),
            ('payments', 'order_id')
        ) AS required_columns(table_name, column_name)
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
                AND table_name = v_required.table_name
                AND column_name = v_required.column_name
        ) THEN
            RAISE EXCEPTION
                'Expected public.%.% was not found. No changes were applied; inspect the live schema first.',
                v_required.table_name, v_required.column_name;
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
            AND column_name = 'id' AND udt_name = 'uuid'
    ) THEN
        RAISE EXCEPTION 'public.profiles.id must be uuid. No changes were applied.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_index AS index_info
        JOIN pg_class AS table_info ON table_info.oid = index_info.indrelid
        JOIN pg_namespace AS schema_info ON schema_info.oid = table_info.relnamespace
        JOIN pg_attribute AS indexed_column
            ON indexed_column.attrelid = table_info.oid
            AND indexed_column.attnum = index_info.indkey[0]
        WHERE schema_info.nspname = 'public'
            AND table_info.relname = 'customer_measurement_sets'
            AND index_info.indisunique
            AND index_info.indnkeyatts = 1
            AND indexed_column.attname = 'customer_id'
    ) THEN
        RAISE EXCEPTION
            'customer_measurement_sets needs a unique constraint on customer_id for the existing upsert. Review the live table before applying this migration.';
    END IF;

    IF to_regprocedure('public.record_payment(uuid,numeric,date,text)') IS NULL THEN
        RAISE EXCEPTION
            'The expected public.record_payment(uuid,numeric,date,text) function was not found. Apply only after reviewing the deployed payment function.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
            AND tablename IN (
                'profiles', 'customers', 'measurements',
                'customer_measurement_sets', 'orders', 'payments'
            )
            AND policyname IN (
                'TailorDesk tenant owner access',
                'TailorDesk tenant owner boundary'
            )
    ) THEN
        RAISE EXCEPTION
            'A policy with a name used by this migration already exists. Review the audit output and policy definitions before applying or rerunning this migration.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.customers AS customer
        LEFT JOIN public.profiles AS profile ON profile.id = customer.tailor_id
        WHERE profile.id IS NULL
    ) THEN
        RAISE EXCEPTION 'A customer has no matching tailor profile. Review ownership before applying this migration.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.measurements AS measurement
        LEFT JOIN public.customers AS customer ON customer.id = measurement.customer_id
        WHERE customer.id IS NULL OR customer.tailor_id IS DISTINCT FROM measurement.tailor_id
    ) THEN
        RAISE EXCEPTION 'A measurement is not linked to a customer owned by the same tailor. Review ownership before applying this migration.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.customer_measurement_sets AS measurement_set
        LEFT JOIN public.customers AS customer ON customer.id = measurement_set.customer_id
        WHERE customer.id IS NULL OR customer.tailor_id IS DISTINCT FROM measurement_set.tailor_id
    ) THEN
        RAISE EXCEPTION 'A customer measurement set is not linked to a customer owned by the same tailor. Review ownership before applying this migration.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.orders AS order_record
        LEFT JOIN public.customers AS customer ON customer.id = order_record.customer_id
        WHERE customer.id IS NULL OR customer.tailor_id IS DISTINCT FROM order_record.tailor_id
    ) THEN
        RAISE EXCEPTION 'An order is not linked to a customer owned by the same tailor. Review ownership before applying this migration.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.payments AS payment
        LEFT JOIN public.orders AS linked_order ON linked_order.id = payment.order_id
        WHERE linked_order.id IS NULL
            OR linked_order.tailor_id IS DISTINCT FROM payment.tailor_id
            OR (
                to_jsonb(payment) ->> 'customer_id' IS NOT NULL
                AND to_jsonb(payment) ->> 'customer_id' IS DISTINCT FROM linked_order.customer_id::text
            )
    ) THEN
        RAISE EXCEPTION 'A payment is not linked to an order owned by the same tailor. Review ownership before applying this migration.';
    END IF;
END;
$preflight$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_measurement_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_measurement_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT ON public.payments TO authenticated;

DO $policies$
DECLARE
    v_payment_customer_check text := '';
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'customer_id'
    ) THEN
        v_payment_customer_check :=
            ' AND (payments.customer_id IS NULL OR payments.customer_id = linked_order.customer_id)';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'TailorDesk tenant owner access') THEN
        EXECUTE $policy$CREATE POLICY "TailorDesk tenant owner access" ON public.profiles AS PERMISSIVE FOR ALL TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()))$policy$;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'TailorDesk tenant owner boundary') THEN
        EXECUTE $policy$CREATE POLICY "TailorDesk tenant owner boundary" ON public.profiles AS RESTRICTIVE FOR ALL TO public USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()))$policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'TailorDesk tenant owner access') THEN
        EXECUTE $policy$CREATE POLICY "TailorDesk tenant owner access" ON public.customers AS PERMISSIVE FOR ALL TO authenticated USING (tailor_id = (SELECT auth.uid())) WITH CHECK (tailor_id = (SELECT auth.uid()))$policy$;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'TailorDesk tenant owner boundary') THEN
        EXECUTE $policy$CREATE POLICY "TailorDesk tenant owner boundary" ON public.customers AS RESTRICTIVE FOR ALL TO public USING (tailor_id = (SELECT auth.uid())) WITH CHECK (tailor_id = (SELECT auth.uid()))$policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'measurements' AND policyname = 'TailorDesk tenant owner access') THEN
        EXECUTE $policy$CREATE POLICY "TailorDesk tenant owner access" ON public.measurements AS PERMISSIVE FOR ALL TO authenticated USING (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = measurements.customer_id AND linked_customer.tailor_id = (SELECT auth.uid()))) WITH CHECK (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = measurements.customer_id AND linked_customer.tailor_id = (SELECT auth.uid())))$policy$;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'measurements' AND policyname = 'TailorDesk tenant owner boundary') THEN
        EXECUTE $policy$CREATE POLICY "TailorDesk tenant owner boundary" ON public.measurements AS RESTRICTIVE FOR ALL TO public USING (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = measurements.customer_id AND linked_customer.tailor_id = (SELECT auth.uid()))) WITH CHECK (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = measurements.customer_id AND linked_customer.tailor_id = (SELECT auth.uid())))$policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_measurement_sets' AND policyname = 'TailorDesk tenant owner access') THEN
        EXECUTE $policy$CREATE POLICY "TailorDesk tenant owner access" ON public.customer_measurement_sets AS PERMISSIVE FOR ALL TO authenticated USING (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = customer_measurement_sets.customer_id AND linked_customer.tailor_id = (SELECT auth.uid()))) WITH CHECK (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = customer_measurement_sets.customer_id AND linked_customer.tailor_id = (SELECT auth.uid())))$policy$;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_measurement_sets' AND policyname = 'TailorDesk tenant owner boundary') THEN
        EXECUTE $policy$CREATE POLICY "TailorDesk tenant owner boundary" ON public.customer_measurement_sets AS RESTRICTIVE FOR ALL TO public USING (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = customer_measurement_sets.customer_id AND linked_customer.tailor_id = (SELECT auth.uid()))) WITH CHECK (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = customer_measurement_sets.customer_id AND linked_customer.tailor_id = (SELECT auth.uid())))$policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'TailorDesk tenant owner access') THEN
        EXECUTE $policy$CREATE POLICY "TailorDesk tenant owner access" ON public.orders AS PERMISSIVE FOR ALL TO authenticated USING (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = orders.customer_id AND linked_customer.tailor_id = (SELECT auth.uid()))) WITH CHECK (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = orders.customer_id AND linked_customer.tailor_id = (SELECT auth.uid())))$policy$;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'TailorDesk tenant owner boundary') THEN
        EXECUTE $policy$CREATE POLICY "TailorDesk tenant owner boundary" ON public.orders AS RESTRICTIVE FOR ALL TO public USING (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = orders.customer_id AND linked_customer.tailor_id = (SELECT auth.uid()))) WITH CHECK (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.customers AS linked_customer WHERE linked_customer.id = orders.customer_id AND linked_customer.tailor_id = (SELECT auth.uid())))$policy$;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'TailorDesk tenant owner access') THEN
        EXECUTE format(
            'CREATE POLICY "TailorDesk tenant owner access" ON public.payments AS PERMISSIVE FOR ALL TO authenticated USING (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.orders AS linked_order WHERE linked_order.id = payments.order_id AND linked_order.tailor_id = (SELECT auth.uid())%1$s)) WITH CHECK (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.orders AS linked_order WHERE linked_order.id = payments.order_id AND linked_order.tailor_id = (SELECT auth.uid())%1$s))',
            v_payment_customer_check
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'TailorDesk tenant owner boundary') THEN
        EXECUTE format(
            'CREATE POLICY "TailorDesk tenant owner boundary" ON public.payments AS RESTRICTIVE FOR ALL TO public USING (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.orders AS linked_order WHERE linked_order.id = payments.order_id AND linked_order.tailor_id = (SELECT auth.uid())%1$s)) WITH CHECK (tailor_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.orders AS linked_order WHERE linked_order.id = payments.order_id AND linked_order.tailor_id = (SELECT auth.uid())%1$s))',
            v_payment_customer_check
        );
    END IF;
END;
$policies$;

REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, date, text) TO authenticated;

COMMIT;
