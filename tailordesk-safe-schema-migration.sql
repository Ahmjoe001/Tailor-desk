-- Add optional customer photos and create missing TailorDesk business tables.
-- Existing tables, rows, grants, and policies are preserved; conflicts stop the migration.
BEGIN;

DO $preflight$
DECLARE
    v_required record;
    v_policy record;
    v_actual_policy record;
    v_relation_kind "char";
    v_relation oid;
    v_data_type text;
    v_constraint_definition text;
    v_has_null_threshold boolean;
    v_has_negative_selling_price boolean;
    v_has_negative_threshold boolean;
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'Expected public.profiles was not found. No changes were applied.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
            AND column_name = 'id' AND udt_name = 'uuid'
    ) THEN
        RAISE EXCEPTION 'public.profiles.id must exist as uuid. No changes were applied.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_index AS index_info
        JOIN pg_attribute AS indexed_column
            ON indexed_column.attrelid = index_info.indrelid
            AND indexed_column.attnum = index_info.indkey[0]
        WHERE index_info.indrelid = 'public.profiles'::regclass
            AND index_info.indisunique
            AND index_info.indisvalid
            AND index_info.indnkeyatts = 1
            AND indexed_column.attname = 'id'
    ) THEN
        RAISE EXCEPTION 'public.profiles.id must have a valid single-column unique or primary-key index. No changes were applied.';
    END IF;

    IF to_regclass('public.customers') IS NULL THEN
        RAISE EXCEPTION 'Expected public.customers was not found. No changes were applied.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customers'
            AND column_name = 'id' AND udt_name = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customers'
            AND column_name = 'tailor_id' AND udt_name = 'uuid'
    ) THEN
        RAISE EXCEPTION 'public.customers.id and tailor_id must exist as uuid. No changes were applied.';
    END IF;

    IF to_regclass('public.customer_measurement_sets') IS NULL THEN
        RAISE EXCEPTION 'Expected public.customer_measurement_sets was not found. No changes were applied.';
    END IF;

    SELECT relkind INTO v_relation_kind
    FROM pg_class
    WHERE oid = to_regclass('public.customer_measurement_sets');

    IF v_relation_kind NOT IN ('r', 'p') THEN
        RAISE EXCEPTION 'public.customer_measurement_sets exists but is not a table or partitioned table. No changes were applied.';
    END IF;

    FOR v_required IN
        SELECT column_name, expected_type
        FROM (VALUES
            ('customer_id', 'uuid'),
            ('tailor_id', 'uuid'),
            ('measurements', 'jsonb'),
            ('unit', 'text'),
            ('notes', 'text')
        ) AS required(column_name, expected_type)
    LOOP
        SELECT udt_name INTO v_data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = 'customer_measurement_sets'
            AND column_name = v_required.column_name;

        IF v_data_type IS NULL THEN
            RAISE EXCEPTION 'Required column public.customer_measurement_sets.% is missing. No changes were applied.',
                v_required.column_name;
        END IF;

        IF v_required.expected_type = 'text' THEN
            IF v_data_type NOT IN ('text', 'varchar') THEN
                RAISE EXCEPTION 'Column public.customer_measurement_sets.% has incompatible type %. Expected text or character varying. No changes were applied.',
                    v_required.column_name, v_data_type;
            END IF;
        ELSIF v_data_type <> v_required.expected_type THEN
            RAISE EXCEPTION 'Column public.customer_measurement_sets.% has incompatible type %. Expected %. No changes were applied.',
                v_required.column_name, v_data_type, v_required.expected_type;
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_index AS index_info
        JOIN pg_attribute AS indexed_column
            ON indexed_column.attrelid = index_info.indrelid
            AND indexed_column.attnum = index_info.indkey[0]
        WHERE index_info.indrelid = 'public.customers'::regclass
            AND index_info.indisunique
            AND index_info.indisvalid
            AND index_info.indnkeyatts = 1
            AND indexed_column.attname = 'id'
    ) THEN
        RAISE EXCEPTION 'public.customers.id must have a valid single-column unique or primary-key index. No changes were applied.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customers'
            AND column_name = 'photo_path'
            AND data_type NOT IN ('text', 'character varying')
    ) THEN
        RAISE EXCEPTION 'Existing public.customers.photo_path is not text/varchar. Review the live schema first.';
    END IF;

    FOR v_required IN
        SELECT * FROM (VALUES
            ('fashion_catalogue', 'id', 'uuid'),
            ('fashion_catalogue', 'tailor_id', 'uuid'),
            ('fashion_catalogue', 'design_name', 'text'),
            ('fashion_catalogue', 'category', 'text'),
            ('fashion_catalogue', 'description', 'text'),
            ('fashion_catalogue', 'price', 'numeric'),
            ('fashion_catalogue', 'image_path', 'text'),
            ('fashion_catalogue', 'created_at', 'timestamptz'),
            ('fashion_catalogue', 'updated_at', 'timestamptz'),
            ('business_expenses', 'id', 'uuid'),
            ('business_expenses', 'tailor_id', 'uuid'),
            ('business_expenses', 'expense_name', 'text'),
            ('business_expenses', 'category', 'text'),
            ('business_expenses', 'amount', 'numeric'),
            ('business_expenses', 'expense_date', 'date'),
            ('business_expenses', 'description', 'text'),
            ('business_expenses', 'created_at', 'timestamptz'),
            ('inventory_items', 'id', 'uuid'),
            ('inventory_items', 'tailor_id', 'uuid'),
            ('inventory_items', 'item_name', 'text'),
            ('inventory_items', 'category', 'text'),
            ('inventory_items', 'quantity', 'numeric'),
            ('inventory_items', 'unit', 'text'),
            ('inventory_items', 'purchase_price', 'numeric'),
            ('inventory_items', 'supplier', 'text'),
            ('inventory_items', 'created_at', 'timestamptz'),
            ('inventory_items', 'updated_at', 'timestamptz'),
            ('customer_measurement_set_history', 'id', 'uuid'),
            ('customer_measurement_set_history', 'customer_id', 'uuid'),
            ('customer_measurement_set_history', 'tailor_id', 'uuid'),
            ('customer_measurement_set_history', 'measurements', 'jsonb'),
            ('customer_measurement_set_history', 'unit', 'text'),
            ('customer_measurement_set_history', 'notes', 'text'),
            ('customer_measurement_set_history', 'recorded_at', 'timestamptz')
        ) AS expected(table_name, column_name, expected_type)
    LOOP
        v_relation := to_regclass('public.' || v_required.table_name);
        IF v_relation IS NULL THEN
            CONTINUE;
        END IF;

        SELECT relkind INTO v_relation_kind
        FROM pg_class
        WHERE oid = v_relation;

        IF v_relation_kind NOT IN ('r', 'p') THEN
            RAISE EXCEPTION 'public.% exists but is not a table or partitioned table. Review dependencies before proceeding.',
                v_required.table_name;
        END IF;

        SELECT udt_name INTO v_data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = v_required.table_name
            AND column_name = v_required.column_name;

        IF v_data_type IS NULL THEN
            RAISE EXCEPTION 'Existing public.%.% is missing. Review the live schema first.',
                v_required.table_name, v_required.column_name;
        END IF;

        IF v_required.expected_type = 'text' THEN
            IF v_data_type NOT IN ('text', 'varchar') THEN
                RAISE EXCEPTION 'Existing public.%.% has unexpected type %. Review the live schema first.',
                    v_required.table_name, v_required.column_name, v_data_type;
            END IF;
        ELSIF v_data_type <> v_required.expected_type THEN
            RAISE EXCEPTION 'Existing public.%.% has unexpected type %. Review the live schema first.',
                v_required.table_name, v_required.column_name, v_data_type;
        END IF;
    END LOOP;

    FOR v_required IN
        SELECT * FROM (VALUES
            ('inventory_items', 'selling_price', 'numeric'),
            ('inventory_items', 'low_stock_threshold', 'numeric'),
            ('inventory_items', 'description', 'text')
        ) AS expected(table_name, column_name, expected_type)
    LOOP
        SELECT udt_name INTO v_data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = v_required.table_name
            AND column_name = v_required.column_name;

        IF v_data_type IS NOT NULL AND v_required.expected_type = 'text'
            AND v_data_type NOT IN ('text', 'varchar') THEN
            RAISE EXCEPTION 'Existing public.%.% has unexpected type %. Review the live schema first.',
                v_required.table_name, v_required.column_name, v_data_type;
        ELSIF v_data_type IS NOT NULL AND v_data_type <> v_required.expected_type THEN
            RAISE EXCEPTION 'Existing public.%.% has unexpected type %. Review the live schema first.',
                v_required.table_name, v_required.column_name, v_data_type;
        END IF;
    END LOOP;

    IF to_regclass('public.inventory_items') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'inventory_items'
                AND column_name = 'low_stock_threshold'
        ) THEN
            EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.inventory_items WHERE low_stock_threshold IS NULL)'
                INTO v_has_null_threshold;

            IF v_has_null_threshold THEN
                RAISE EXCEPTION 'Cannot enforce inventory_items.low_stock_threshold NOT NULL: existing rows contain NULL values. Review them manually before retrying.';
            END IF;
        END IF;
    END IF;

    IF to_regclass('public.inventory_items') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'inventory_items'
                AND column_name = 'selling_price'
        ) THEN
            EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.inventory_items WHERE selling_price < 0)'
                INTO v_has_negative_selling_price;

            IF v_has_negative_selling_price THEN
                RAISE EXCEPTION 'Existing inventory_items rows contain negative selling_price values. Review them before adding the non-negative constraint.';
            END IF;
        END IF;
    END IF;

    IF to_regclass('public.inventory_items') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'inventory_items'
                AND column_name = 'low_stock_threshold'
        ) THEN
            EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.inventory_items WHERE low_stock_threshold < 0)'
                INTO v_has_negative_threshold;

            IF v_has_negative_threshold THEN
                RAISE EXCEPTION 'Existing inventory_items rows contain negative low_stock_threshold values. Review them before adding the non-negative constraint.';
            END IF;
        END IF;
    END IF;

    SELECT pg_get_constraintdef(constraint_info.oid) INTO v_constraint_definition
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid = to_regclass('public.inventory_items')
        AND constraint_info.conname = 'inventory_items_selling_price_nonnegative_check';
    IF v_constraint_definition IS NOT NULL
        AND (v_constraint_definition NOT ILIKE '%selling_price%'
            OR v_constraint_definition NOT ILIKE '%IS NULL%'
            OR v_constraint_definition NOT ILIKE '%>=%') THEN
        RAISE EXCEPTION 'Existing inventory selling-price constraint has an unexpected definition. Review it manually.';
    END IF;

    SELECT pg_get_constraintdef(constraint_info.oid) INTO v_constraint_definition
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid = to_regclass('public.inventory_items')
        AND constraint_info.conname = 'inventory_items_low_stock_threshold_nonnegative_check';
    IF v_constraint_definition IS NOT NULL
        AND (v_constraint_definition NOT ILIKE '%low_stock_threshold%'
            OR v_constraint_definition NOT ILIKE '%>=%') THEN
        RAISE EXCEPTION 'Existing inventory threshold constraint has an unexpected definition. Review it manually.';
    END IF;

    FOR v_policy IN
        SELECT * FROM (VALUES
            ('fashion_catalogue', 'TailorDesk catalogue owner access', 'PERMISSIVE', 'ALL', 'authenticated', true, false),
            ('fashion_catalogue', 'TailorDesk catalogue owner boundary', 'RESTRICTIVE', 'ALL', 'public', true, false),
            ('business_expenses', 'TailorDesk expenses owner access', 'PERMISSIVE', 'ALL', 'authenticated', true, false),
            ('business_expenses', 'TailorDesk expenses owner boundary', 'RESTRICTIVE', 'ALL', 'public', true, false),
            ('inventory_items', 'TailorDesk inventory owner access', 'PERMISSIVE', 'ALL', 'authenticated', true, false),
            ('inventory_items', 'TailorDesk inventory owner boundary', 'RESTRICTIVE', 'ALL', 'public', true, false),
            ('customer_measurement_set_history', 'TailorDesk measurement history owner access', 'PERMISSIVE', 'SELECT', 'authenticated', false, true),
            ('customer_measurement_set_history', 'TailorDesk measurement history owner boundary', 'RESTRICTIVE', 'SELECT', 'public', false, true)
        ) AS expected(table_name, policy_name, permissive, command, role_name, needs_check, needs_customer_link)
    LOOP
        IF to_regclass('public.' || v_policy.table_name) IS NULL THEN
            CONTINUE;
        END IF;

        SELECT * INTO v_actual_policy
        FROM pg_policies
        WHERE schemaname = 'public'
            AND tablename = v_policy.table_name
            AND policyname = v_policy.policy_name;

        IF FOUND AND (
            v_actual_policy.permissive <> v_policy.permissive
            OR v_actual_policy.cmd <> v_policy.command
            OR v_actual_policy.roles::text NOT ILIKE '%' || v_policy.role_name || '%'
            OR COALESCE(v_actual_policy.qual, '') NOT ILIKE '%tailor_id =%'
            OR COALESCE(v_actual_policy.qual, '') NOT ILIKE '%auth.uid%'
            OR (v_policy.needs_check AND (
                COALESCE(v_actual_policy.with_check, '') NOT ILIKE '%tailor_id =%'
                OR COALESCE(v_actual_policy.with_check, '') NOT ILIKE '%auth.uid%'
            ))
            OR (v_policy.needs_customer_link AND (
                COALESCE(v_actual_policy.qual, '') NOT ILIKE '%customer_measurement_set_history.customer_id%'
                OR COALESCE(v_actual_policy.qual, '') NOT ILIKE '%customer.tailor_id =%'
            ))
        ) THEN
            RAISE EXCEPTION 'Existing policy public.%.% has an unexpected definition. Review it manually; no changes were applied.',
                v_policy.table_name, v_policy.policy_name;
        END IF;
    END LOOP;
END;
$preflight$;

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS photo_path text;

DO $create_tables_and_policies$
DECLARE
    v_created_fashion_catalogue boolean := false;
    v_created_business_expenses boolean := false;
    v_created_inventory_items boolean := false;
    v_created_measurement_history boolean := false;
BEGIN
    IF to_regclass('public.fashion_catalogue') IS NULL THEN
        CREATE TABLE public.fashion_catalogue (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tailor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
            design_name text NOT NULL CHECK (length(btrim(design_name)) BETWEEN 1 AND 150),
            category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 100),
            description text,
            price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
            image_path text NOT NULL,
            created_at timestamp with time zone NOT NULL DEFAULT now(),
            updated_at timestamp with time zone NOT NULL DEFAULT now()
        );
        v_created_fashion_catalogue := true;
    END IF;

    IF to_regclass('public.business_expenses') IS NULL THEN
        CREATE TABLE public.business_expenses (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tailor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
            expense_name text NOT NULL CHECK (length(btrim(expense_name)) BETWEEN 1 AND 150),
            category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 100),
            amount numeric(12, 2) NOT NULL CHECK (amount > 0),
            expense_date date NOT NULL DEFAULT CURRENT_DATE,
            description text,
            created_at timestamp with time zone NOT NULL DEFAULT now()
        );
        v_created_business_expenses := true;
    END IF;

    IF to_regclass('public.inventory_items') IS NULL THEN
        CREATE TABLE public.inventory_items (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tailor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
            item_name text NOT NULL CHECK (length(btrim(item_name)) BETWEEN 1 AND 150),
            category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 100),
            quantity numeric(12, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
            unit text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
            purchase_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
            selling_price numeric(12, 2),
            low_stock_threshold numeric(12, 3) NOT NULL DEFAULT 5,
            description text,
            supplier text,
            created_at timestamp with time zone NOT NULL DEFAULT now(),
            updated_at timestamp with time zone NOT NULL DEFAULT now(),
            CONSTRAINT inventory_items_selling_price_nonnegative_check
                CHECK (selling_price IS NULL OR selling_price >= 0),
            CONSTRAINT inventory_items_low_stock_threshold_nonnegative_check
                CHECK (low_stock_threshold >= 0)
        );
        v_created_inventory_items := true;
    END IF;

    IF to_regclass('public.customer_measurement_set_history') IS NULL THEN
        CREATE TABLE public.customer_measurement_set_history (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
            tailor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
            measurements jsonb NOT NULL CHECK (jsonb_typeof(measurements) = 'object'),
            unit text NOT NULL CHECK (unit IN ('cm', 'in')),
            notes text,
            recorded_at timestamp with time zone NOT NULL DEFAULT now()
        );
        v_created_measurement_history := true;
    END IF;

    ALTER TABLE public.inventory_items
        ADD COLUMN IF NOT EXISTS selling_price numeric(12, 2),
        ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(12, 3) NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE public.inventory_items
        ALTER COLUMN low_stock_threshold SET DEFAULT 5,
        ALTER COLUMN low_stock_threshold SET NOT NULL;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.inventory_items'::regclass
            AND conname = 'inventory_items_selling_price_nonnegative_check'
    ) THEN
        ALTER TABLE public.inventory_items
            ADD CONSTRAINT inventory_items_selling_price_nonnegative_check
            CHECK (selling_price IS NULL OR selling_price >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.inventory_items'::regclass
            AND conname = 'inventory_items_low_stock_threshold_nonnegative_check'
    ) THEN
        ALTER TABLE public.inventory_items
            ADD CONSTRAINT inventory_items_low_stock_threshold_nonnegative_check
            CHECK (low_stock_threshold >= 0);
    END IF;

    ALTER TABLE public.fashion_catalogue ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.business_expenses ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.customer_measurement_set_history ENABLE ROW LEVEL SECURITY;

    IF v_created_fashion_catalogue THEN
        REVOKE ALL ON public.fashion_catalogue FROM PUBLIC, anon;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.fashion_catalogue TO authenticated;
    END IF;
    IF v_created_business_expenses THEN
        REVOKE ALL ON public.business_expenses FROM PUBLIC, anon;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_expenses TO authenticated;
    END IF;
    IF v_created_inventory_items THEN
        REVOKE ALL ON public.inventory_items FROM PUBLIC, anon;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
    END IF;
    IF v_created_measurement_history THEN
        REVOKE ALL ON public.customer_measurement_set_history FROM PUBLIC, anon;
        GRANT SELECT ON public.customer_measurement_set_history TO authenticated;
    END IF;

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

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'business_expenses'
            AND policyname = 'TailorDesk expenses owner access'
    ) THEN
        CREATE POLICY "TailorDesk expenses owner access"
            ON public.business_expenses
            AS PERMISSIVE FOR ALL TO authenticated
            USING (tailor_id = (SELECT auth.uid()))
            WITH CHECK (tailor_id = (SELECT auth.uid()));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'business_expenses'
            AND policyname = 'TailorDesk expenses owner boundary'
    ) THEN
        CREATE POLICY "TailorDesk expenses owner boundary"
            ON public.business_expenses
            AS RESTRICTIVE FOR ALL TO public
            USING (tailor_id = (SELECT auth.uid()))
            WITH CHECK (tailor_id = (SELECT auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'inventory_items'
            AND policyname = 'TailorDesk inventory owner access'
    ) THEN
        CREATE POLICY "TailorDesk inventory owner access"
            ON public.inventory_items
            AS PERMISSIVE FOR ALL TO authenticated
            USING (tailor_id = (SELECT auth.uid()))
            WITH CHECK (tailor_id = (SELECT auth.uid()));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'inventory_items'
            AND policyname = 'TailorDesk inventory owner boundary'
    ) THEN
        CREATE POLICY "TailorDesk inventory owner boundary"
            ON public.inventory_items
            AS RESTRICTIVE FOR ALL TO public
            USING (tailor_id = (SELECT auth.uid()))
            WITH CHECK (tailor_id = (SELECT auth.uid()));
    END IF;

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
$create_tables_and_policies$;

CREATE OR REPLACE FUNCTION public.archive_customer_measurement_set_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    INSERT INTO public.customer_measurement_set_history (
        customer_id, tailor_id, measurements, unit, notes, recorded_at
    ) VALUES (
        OLD.customer_id,
        OLD.tailor_id,
        OLD.measurements,
        OLD.unit,
        OLD.notes,
        pg_catalog.now()
    );

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_customer_measurement_set_version()
    FROM PUBLIC, anon, authenticated;

DO $measurement_history_trigger$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_trigger AS trigger_info
        JOIN pg_class AS source_table ON source_table.oid = trigger_info.tgrelid
        JOIN pg_namespace AS source_schema ON source_schema.oid = source_table.relnamespace
        JOIN pg_proc AS trigger_function ON trigger_function.oid = trigger_info.tgfoid
        JOIN pg_namespace AS function_schema ON function_schema.oid = trigger_function.pronamespace
        WHERE trigger_info.tgname = 'archive_customer_measurement_set_version'
            AND NOT trigger_info.tgisinternal
            AND (
                source_schema.nspname <> 'public'
                OR source_table.relname <> 'customer_measurement_sets'
                OR function_schema.nspname <> 'public'
                OR trigger_function.proname <> 'archive_customer_measurement_set_version'
                OR trigger_info.tgtype <> 19
                OR cardinality(trigger_info.tgattr) <> 0
                OR pg_get_triggerdef(trigger_info.oid, true) NOT ILIKE '%BEFORE UPDATE%'
                OR pg_get_triggerdef(trigger_info.oid, true) ILIKE '%UPDATE OF%'
            )
    ) THEN
        RAISE EXCEPTION 'A conflicting archive_customer_measurement_set_version trigger exists. Review it manually; no changes were applied.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_trigger AS trigger_info
        JOIN pg_class AS source_table ON source_table.oid = trigger_info.tgrelid
        JOIN pg_namespace AS source_schema ON source_schema.oid = source_table.relnamespace
        WHERE source_schema.nspname = 'public'
            AND source_table.relname = 'customer_measurement_sets'
            AND trigger_info.tgname = 'archive_customer_measurement_set_version'
            AND NOT trigger_info.tgisinternal
            AND trigger_info.tgenabled IN ('D', 'R')
    ) THEN
        RAISE EXCEPTION 'The existing measurement history trigger is disabled for normal updates. Review it manually; no changes were applied.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger AS trigger_info
        JOIN pg_class AS source_table ON source_table.oid = trigger_info.tgrelid
        JOIN pg_namespace AS source_schema ON source_schema.oid = source_table.relnamespace
        WHERE source_schema.nspname = 'public'
            AND source_table.relname = 'customer_measurement_sets'
            AND trigger_info.tgname = 'archive_customer_measurement_set_version'
            AND NOT trigger_info.tgisinternal
    ) THEN
        CREATE TRIGGER archive_customer_measurement_set_version
            BEFORE UPDATE ON public.customer_measurement_sets
            FOR EACH ROW
            EXECUTE FUNCTION public.archive_customer_measurement_set_version();
    END IF;
END;
$measurement_history_trigger$;

CREATE INDEX IF NOT EXISTS fashion_catalogue_tailor_created_idx
    ON public.fashion_catalogue (tailor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS business_expenses_tailor_date_idx
    ON public.business_expenses (tailor_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS inventory_items_tailor_name_idx
    ON public.inventory_items (tailor_id, item_name);
CREATE INDEX IF NOT EXISTS customer_measurement_history_customer_date_idx
    ON public.customer_measurement_set_history (tailor_id, customer_id, recorded_at DESC);

COMMIT;