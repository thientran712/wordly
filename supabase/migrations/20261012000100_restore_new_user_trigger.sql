-- Khôi phục trigger tạo hồ sơ khi có tài khoản mới.
--
-- Trigger on_auth_user_created nằm trên auth.users (schema auth) nên không có
-- trong baseline (dump chỉ lấy schema public) → mất khi chuyển sang Supabase
-- self-host trên VPS. Từ đó mọi tài khoản mới không có dòng profiles /
-- email_preferences → GET /api/profile trả 500.
--
-- Idempotent: chạy lại an toàn.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Bù cho các tài khoản đã tạo trong lúc thiếu trigger (cùng logic handle_new_user)
INSERT INTO public.profiles (id, email, name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

INSERT INTO public.email_preferences (user_id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.email_preferences e ON e.user_id = u.id
WHERE e.user_id IS NULL;
