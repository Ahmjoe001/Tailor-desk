-- TailorDesk order, payment, and private image-storage migration.
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS material_received_date date;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS clothing_type text,
    ADD COLUMN IF NOT EXISTS style_name text,
    ADD COLUMN IF NOT EXISTS design_description text,
    ADD COLUMN IF NOT EXISTS fabric_image_path text,
    ADD COLUMN IF NOT EXISTS style_image_path text,
    ADD COLUMN IF NOT EXISTS sewing_instructions text,
    ADD COLUMN IF NOT EXISTS material_received_date date;

CREATE TABLE IF NOT EXISTS public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
    amount numeric(12, 2) NOT NULL CHECK (amount > 0),
    payment_date date NOT NULL DEFAULT CURRENT_DATE,
    method text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS payments_tailor_date_idx
    ON public.payments (tailor_id, payment_date DESC);

DROP POLICY IF EXISTS "Tailors can read their own payments" ON public.payments;
CREATE POLICY "Tailors can read their own payments"
    ON public.payments
    FOR SELECT
    TO authenticated
    USING (tailor_id = (SELECT auth.uid()));

GRANT SELECT ON public.payments TO authenticated;

CREATE OR REPLACE FUNCTION public.record_payment(
    p_order_id uuid,
    p_amount numeric,
    p_payment_date date,
    p_method text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_order public.orders%ROWTYPE;
    v_payment_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'You must be signed in to record a payment.';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
        RAISE EXCEPTION 'Payment amount must be positive and have no more than two decimal places.';
    END IF;

    IF p_payment_date IS NULL THEN
        RAISE EXCEPTION 'Payment date is required.';
    END IF;

    SELECT *
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND OR v_order.tailor_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Order not found or not owned by the signed-in tailor.';
    END IF;

    IF p_amount > COALESCE(v_order.total_amount, 0) - COALESCE(v_order.amount_paid, 0) THEN
        RAISE EXCEPTION 'Payment exceeds the outstanding order balance.';
    END IF;

    INSERT INTO public.payments (tailor_id, order_id, amount, payment_date, method)
    VALUES (v_order.tailor_id, v_order.id, p_amount, p_payment_date, NULLIF(BTRIM(p_method), ''))
    RETURNING id INTO v_payment_id;

    UPDATE public.orders
    SET amount_paid = COALESCE(amount_paid, 0) + p_amount
    WHERE id = v_order.id;

    RETURN v_payment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, date, text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'tailordesk-order-images',
    'tailordesk-order-images',
    false,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "TailorDesk image owners can read files" ON storage.objects;
CREATE POLICY "TailorDesk image owners can read files"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'tailordesk-order-images'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

DROP POLICY IF EXISTS "TailorDesk image owners can upload files" ON storage.objects;
CREATE POLICY "TailorDesk image owners can upload files"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'tailordesk-order-images'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

DROP POLICY IF EXISTS "TailorDesk image owners can delete files" ON storage.objects;
CREATE POLICY "TailorDesk image owners can delete files"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'tailordesk-order-images'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );
