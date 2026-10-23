-- Giữ lượt TRƯỚC khi gọi AI (review cuối nhánh feat/in-app-ads): kiểm rồi mới
-- trừ sau khi dịch để lọt nhiều request song song khi chỉ còn 1 lượt — tất cả
-- qua kiểm, gọi AI, chỉ một bị trừ. Giờ route gọi consume_translate trước, dịch
-- lỗi / app huỷ thì hoàn bằng phiếu (chỉ của chính mình, một lần, trong 10 phút).

CREATE TABLE public.translate_charges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  charged    text NOT NULL CHECK (charged IN ('free', 'credit')),
  -- Câu vừa được ghi key mới → hoàn thì xoá key (lần sau phải trừ lại)
  quota_key  uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX translate_charges_user_created ON public.translate_charges (user_id, created_at);
-- Không policy: chỉ consume_translate / refund_translate (SECURITY DEFINER) chạm tới.
ALTER TABLE public.translate_charges ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_translate(p_daily_free int, p_quota_key uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_day      date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_used     int;
  v_credits  int;
  v_calls    int;
  v_inserted boolean;
  v_charged  text;
  v_charge   uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_daily_free IS NULL OR p_daily_free < 0 THEN RAISE EXCEPTION 'invalid daily free'; END IF;

  IF p_quota_key IS NOT NULL THEN
    INSERT INTO translate_ad_keys AS k (user_id, day, quota_key, calls) VALUES (v_uid, v_day, p_quota_key, 1)
    ON CONFLICT (user_id, day, quota_key) DO UPDATE SET calls = k.calls + 1 WHERE k.calls < 40
    RETURNING k.calls, (k.xmax = 0) INTO v_calls, v_inserted;
    IF v_calls IS NOT NULL AND NOT v_inserted THEN
      RETURN jsonb_build_object('allowed', true, 'charged', 'none',
        'used', COALESCE((SELECT count FROM usage_daily WHERE user_id = v_uid AND day = v_day AND kind = 'translate'), 0),
        'credits', COALESCE((SELECT balance FROM ad_credits WHERE user_id = v_uid), 0));
    END IF;
  END IF;

  IF p_daily_free > 0 THEN
    INSERT INTO usage_daily AS u (user_id, day, kind, count) VALUES (v_uid, v_day, 'translate', 1)
    ON CONFLICT (user_id, day, kind) DO UPDATE SET count = u.count + 1 WHERE u.count < p_daily_free
    RETURNING u.count INTO v_used;
  END IF;

  IF v_used IS NOT NULL THEN
    v_charged := 'free';
    SELECT balance INTO v_credits FROM ad_credits WHERE user_id = v_uid;
  ELSE
    UPDATE ad_credits SET balance = balance - 1, updated_at = now()
    WHERE user_id = v_uid AND balance > 0
    RETURNING balance INTO v_credits;
    IF v_credits IS NOT NULL THEN v_charged := 'credit'; END IF;
    SELECT count INTO v_used FROM usage_daily WHERE user_id = v_uid AND day = v_day AND kind = 'translate';
  END IF;

  IF v_charged IS NULL THEN
    -- Hết lượt: key mới không được ghi (lần sau vẫn là "key mới" → vẫn chặn)
    IF p_quota_key IS NOT NULL AND v_inserted THEN
      DELETE FROM translate_ad_keys WHERE user_id = v_uid AND day = v_day AND quota_key = p_quota_key;
    END IF;
    RETURN jsonb_build_object('allowed', false, 'charged', 'none', 'used', COALESCE(v_used, 0), 'credits', 0);
  END IF;

  -- Key đã đủ 40 lượt gọi vừa được trừ lượt mới → đếm lại từ 1
  IF p_quota_key IS NOT NULL AND v_calls IS NULL THEN
    UPDATE translate_ad_keys SET calls = 1 WHERE user_id = v_uid AND day = v_day AND quota_key = p_quota_key;
  END IF;
  -- Phiếu giữ lượt: route hoàn lại nếu dịch lỗi / app huỷ (refund_translate)
  DELETE FROM translate_charges WHERE user_id = v_uid AND created_at < now() - interval '1 hour';
  INSERT INTO translate_charges (user_id, day, charged, quota_key)
  VALUES (v_uid, v_day, v_charged, CASE WHEN v_inserted OR v_calls IS NULL THEN p_quota_key END)
  RETURNING id INTO v_charge;
  RETURN jsonb_build_object('allowed', true, 'charged', v_charged, 'charge_id', v_charge,
    'used', COALESCE(v_used, 0), 'credits', COALESCE(v_credits, 0));
END $$;

CREATE FUNCTION public.refund_translate(p_charge_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_day     date;
  v_charged text;
  v_key     uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM translate_charges
  WHERE id = p_charge_id AND user_id = v_uid AND created_at > now() - interval '10 minutes'
  RETURNING day, charged, quota_key INTO v_day, v_charged, v_key;
  IF v_charged IS NULL THEN RETURN false; END IF;

  IF v_charged = 'free' THEN
    UPDATE usage_daily SET count = count - 1
    WHERE user_id = v_uid AND day = v_day AND kind = 'translate' AND count > 0;
  ELSE
    INSERT INTO ad_credits AS c (user_id, balance) VALUES (v_uid, 1)
    ON CONFLICT (user_id) DO UPDATE SET balance = c.balance + 1, updated_at = now();
  END IF;
  IF v_key IS NOT NULL THEN
    DELETE FROM translate_ad_keys WHERE user_id = v_uid AND day = v_day AND quota_key = v_key;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.refund_translate(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refund_translate(uuid) TO authenticated;
