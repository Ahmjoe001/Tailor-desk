-- Add tailor-owned expense and inventory records without changing existing data.
BEGIN;

DO $preflight$
DECLARE
    v_required record;
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'Expected public.profiles was not found. No changes were applied.';
    END IF;

    FOR v_required IN
        SELECT * FROM (VALUES
            ('business_expenses', 'id'), ('business_expenses', 'tailor_id'),
            ('business_expenses', 'expense_name'), ('business_expenses', 'category'),
            ('business_expenses', 'amount'), ('business_expenses', 'expense_date'),
            ('business_expenses', 'description'), ('business_expenses', 'created_at'),
            ('inventory_items', 'id'), ('inventory_items', 'tailor_id'),
            ('inventory_items', 'item_name'), ('inventory_items', 'category'),
            ('inventory_items', 'quantity'), ('inventory_items', 'unit'),
            ('inventory_items', 'purchase_price'), ('inventory_items', 'supplier'),
            ('inventory_items', 'created_at'), ('inventory_items', 'updated_at')
        ) AS required(table_name, column_name)
    LOOP
        IF to_regclass('public.' || v_required.table_name) IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND table_name = v_required.table_name
                    AND column_name = v_required.column_name
            ) THEN
            RAISE EXCEPTION 'Existing public.%.% is missing. Review the live schema first.',
                v_required.table_name, v_required.column_name;
        END IF;
    END LOOP;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.business_expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    expense_name text NOT NULL CHECK (length(btrim(expense_name)) BETWEEN 1 AND 150),
    category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 100),
    amount numeric(12, 2) NOT NULL CHECK (amount > 0),
    expense_date date NOT NULL DEFAULT CURRENT_DATE,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
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
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items
    ADD COLUMN IF NOT EXISTS selling_price numeric(12, 2),
    ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(12, 3) NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS description text;

DO $inventory_constraints$
BEGIN
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
END;
$inventory_constraints$;

CREATE INDEX IF NOT EXISTS business_expenses_tailor_date_idx
    ON public.business_expenses (tailor_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS inventory_items_tailor_name_idx
    ON public.inventory_items (tailor_id, item_name);

ALTER TABLE public.business_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_expenses, public.inventory_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_expenses, public.inventory_items TO authenticated;

DO $policies$
BEGIN
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
END;
$policies$;

COMMIT;
