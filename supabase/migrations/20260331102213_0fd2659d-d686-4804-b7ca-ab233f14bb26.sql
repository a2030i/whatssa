
-- Fix 1: Restrict coupons SELECT to super_admin only, add a secure validation function
DROP POLICY IF EXISTS "Authenticated read active coupons" ON public.coupons;

CREATE POLICY "Super admin reads all coupons"
ON public.coupons FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create a secure function to validate and redeem coupons
CREATE OR REPLACE FUNCTION public.validate_coupon(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _coupon record;
BEGIN
  SELECT * INTO _coupon FROM public.coupons
  WHERE code = upper(_code) AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'كوبون غير صالح');
  END IF;

  IF _coupon.max_uses > 0 AND _coupon.used_count >= _coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'الكوبون منتهي الاستخدام');
  END IF;

  IF _coupon.valid_until IS NOT NULL AND now() > _coupon.valid_until THEN
    RETURN jsonb_build_object('valid', false, 'error', 'الكوبون منتهي الصلاحية');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'id', _coupon.id,
    'discount_type', _coupon.discount_type,
    'discount_value', _coupon.discount_value,
    'applicable_plans', _coupon.applicable_plans,
    'min_plan_price', _coupon.min_plan_price
  );
END;
$$;
