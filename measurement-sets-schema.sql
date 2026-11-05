
-- One reusable body-measurement set per customer.
-- Tenant-scoped policies and grants are installed by tenant-data-isolation-migration.sql.
CREATE TABLE IF NOT EXISTS public.customer_measurement_sets (
    customer_id uuid PRIMARY KEY REFERENCES public.customers (id) ON DELETE CASCADE,
    tailor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    measurements jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(measurements) = 'object'),
    unit text NOT NULL DEFAULT 'cm'
        CHECK (unit IN ('cm', 'in')),
    notes text,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_measurement_sets ENABLE ROW LEVEL SECURITY;
