-- Xóa hẳn tính năng B2B ("trung tâm tiếng Anh") — xem
-- docs/superpowers/specs/2026-10-10-remove-b2b-design.md
--
-- THỨ TỰ BẮT BUỘC TRƯỚC KHI CHẠY FILE NÀY:
--   1. Vào Supabase Dashboard → Auth → Hooks → tắt "Customize Access Token
--      (JWT) Claims" (hook đang gọi custom_access_token_hook()).
--   2. Thử đăng nhập 1 tài khoản test, xác nhận JWT không còn claim
--      user_orgs nhưng login vẫn thành công.
--   3. CHỈ SAU KHI (1) và (2) xác nhận OK mới chạy migration này.
--
-- Chạy SAI thứ tự (migration trước khi tắt hook) sẽ khiến MỌI user — kể cả
-- B2C — không đăng nhập được, vì hook vẫn gọi function đã bị xóa.

-- ── Functions (xóa trước vì bảng phụ thuộc vào chúng qua trigger/policy) ──
DROP FUNCTION IF EXISTS custom_access_token_hook(jsonb);
DROP FUNCTION IF EXISTS jwt_org_role(uuid);
DROP FUNCTION IF EXISTS is_org_member(uuid);
DROP FUNCTION IF EXISTS is_org_owner(uuid);
DROP FUNCTION IF EXISTS is_org_staff(uuid);
DROP FUNCTION IF EXISTS check_video_quota(uuid);
DROP FUNCTION IF EXISTS set_vnpay_secret(uuid, text);
DROP FUNCTION IF EXISTS get_vnpay_secret(uuid);

-- ── Bảng con trước, bảng cha sau (thứ tự khóa ngoại) ──
DROP TABLE IF EXISTS assignment_deliveries;
DROP TABLE IF EXISTS class_assignments;
DROP TABLE IF EXISTS homework_submissions;
DROP TABLE IF EXISTS homework;
DROP TABLE IF EXISTS speaking_submissions;
DROP TABLE IF EXISTS speaking_prompts;
DROP TABLE IF EXISTS guardian_links;
DROP TABLE IF EXISTS student_progress_snapshots;
DROP TABLE IF EXISTS vnpay_transactions;
DROP TABLE IF EXISTS org_payment_configs;
DROP TABLE IF EXISTS tuition_payments;
DROP TABLE IF EXISTS tuition_records;
DROP TABLE IF EXISTS org_storage_usage;
DROP TABLE IF EXISTS org_video_usage;
DROP TABLE IF EXISTS lesson_materials;
DROP TABLE IF EXISTS class_sessions;
DROP TABLE IF EXISTS org_field_defs;
DROP TABLE IF EXISTS org_features;
DROP TABLE IF EXISTS org_settings;
DROP TABLE IF EXISTS class_members;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS organizations;

-- ── quiz_attempts: giữ bảng (dùng cho B2C), chỉ bỏ 3 cột B2B ──
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS org_id;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS class_id;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS membership_id;
