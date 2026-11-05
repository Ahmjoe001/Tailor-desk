-- Optional, non-destructive addition for garment-specific measurements.
-- Each order owns its own measurements and unit. Existing customer-level
-- measurement rows and measurement sets remain untouched.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS measurement_data jsonb;

COMMENT ON COLUMN public.orders.measurement_data IS
    'Optional garment-specific measurements: {"unit":"cm"|"in","values":{"chest_bust":42}}';
