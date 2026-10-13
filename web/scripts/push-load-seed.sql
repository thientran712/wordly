-- web/scripts/push-load-seed.sql — CHỈ Supabase local. Tạo 10.000 user giả
-- (email loadtest+N@wordly.local), mỗi người 1 thiết bị + push bật + khung 20:00.
-- Chạy: docker exec -i supabase_db_wordly psql -U postgres -d postgres < scripts/push-load-seed.sql
-- Dọn: DELETE FROM auth.users WHERE email LIKE 'loadtest+%@wordly.local';
INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'loadtest+' || g || '@wordly.local', now(), now()
FROM generate_series(1, 10000) g;

INSERT INTO public.push_devices (user_id, token)
SELECT id, 'load' || replace(id::text, '-', '') || repeat('x', 80) FROM auth.users WHERE email LIKE 'loadtest+%';
INSERT INTO public.push_preferences (user_id, enabled) SELECT id, true FROM auth.users WHERE email LIKE 'loadtest+%';
INSERT INTO public.push_slots (user_id, send_time) SELECT id, '20:00' FROM auth.users WHERE email LIKE 'loadtest+%';
UPDATE public.profiles SET timezone = 'Asia/Ho_Chi_Minh' WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'loadtest+%');
