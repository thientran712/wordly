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
--
-- THỨ TỰ NỘI BỘ CỦA FILE NÀY (bắt buộc, không thể đảo):
--   1. DROP POLICY trên storage.objects và trên quiz_attempts (bảng B2C) —
--      các policy này gọi is_org_*/teaches_class, nên phải xóa TRƯỚC khi
--      xóa function, nếu không Postgres báo lỗi 2BP01 "cannot drop function
--      because other objects depend on it".
--   2. DROP COLUMN org_id/class_id/membership_id trên quiz_attempts — phải
--      làm TRƯỚC khi DROP TABLE classes/organizations/memberships, nếu
--      không FK constraint chặn lại.
--   3. DROP VIEW tuition_balances — phụ thuộc tuition_payments/tuition_records,
--      không tự mất theo DROP TABLE vì view không phải con của bảng.
--   4. DROP TABLE 23 bảng B2B (con trước cha) — tự CASCADE theo policy và
--      trigger riêng của chúng, không cần xóa tay.
--   5. DROP FUNCTION toàn bộ — an toàn vì không còn gì phụ thuộc.

BEGIN;

-- ── 1. Policy trên bảng/schema KHÔNG bị DROP TABLE (phải xóa tay) ──────────

-- storage.objects — không phải bảng do migration B2B tạo, DROP TABLE không
-- đụng tới. 6 policy này (lesson_library.sql + speaking_review.sql) gọi
-- is_org_member/is_org_staff.
DROP POLICY IF EXISTS lesson_materials_storage_read ON storage.objects;
DROP POLICY IF EXISTS lesson_materials_storage_write ON storage.objects;
DROP POLICY IF EXISTS lesson_materials_storage_delete ON storage.objects;
DROP POLICY IF EXISTS speaking_storage_read ON storage.objects;
DROP POLICY IF EXISTS speaking_storage_write ON storage.objects;
DROP POLICY IF EXISTS speaking_storage_delete ON storage.objects;

-- quiz_attempts là bảng B2C (giữ lại), nhưng có 1 policy B2B gọi
-- is_org_owner/teaches_class và đọc cột org_id/class_id sắp bị xóa.
DROP POLICY IF EXISTS quiz_attempts_select_staff ON quiz_attempts;

-- ── 2. Cột B2B trên bảng B2C — xóa TRƯỚC khi DROP TABLE cha (FK) ───────────
-- DROP COLUMN tự xóa luôn index quiz_attempts_class_idx gắn trên class_id.
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS org_id;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS class_id;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS membership_id;

-- ── 3. View phụ thuộc bảng B2B — xóa trước khi DROP TABLE cha ─────────────
DROP VIEW IF EXISTS tuition_balances;

-- ── 4. Bảng con trước, bảng cha sau (thứ tự khóa ngoại) ────────────────────
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

-- ── 5. Functions — an toàn xóa bây giờ, không còn policy/trigger nào gọi ──
--
-- Trigger function (enforce_*_tenant, track_*, record_vnpay_payment,
-- cleanup_vnpay_secret) đã mất CHỦ (trigger của chúng bị DROP TABLE cascade
-- xóa cùng bảng ở bước 3), nhưng FUNCTION bản thân không tự mất theo —
-- phải DROP riêng.
DROP FUNCTION IF EXISTS custom_access_token_hook(jsonb);
DROP FUNCTION IF EXISTS jwt_org_role(uuid);
DROP FUNCTION IF EXISTS is_org_member(uuid);
DROP FUNCTION IF EXISTS is_org_owner(uuid);
DROP FUNCTION IF EXISTS is_org_staff(uuid);
DROP FUNCTION IF EXISTS teaches_class(uuid);
DROP FUNCTION IF EXISTS in_class(uuid);
DROP FUNCTION IF EXISTS join_class_by_code(text);
DROP FUNCTION IF EXISTS check_storage_quota(uuid, bigint);
DROP FUNCTION IF EXISTS check_video_quota(uuid, bigint);
DROP FUNCTION IF EXISTS compute_org_progress_snapshots(uuid);
DROP FUNCTION IF EXISTS user_streak_days(uuid);
DROP FUNCTION IF EXISTS set_vnpay_secret(uuid, text);
DROP FUNCTION IF EXISTS get_vnpay_secret(uuid);
DROP FUNCTION IF EXISTS record_vnpay_payment();
DROP FUNCTION IF EXISTS cleanup_vnpay_secret();
DROP FUNCTION IF EXISTS enforce_class_member_tenant();
DROP FUNCTION IF EXISTS enforce_assignment_tenant();
DROP FUNCTION IF EXISTS enforce_homework_tenant();
DROP FUNCTION IF EXISTS enforce_submission_tenant();
DROP FUNCTION IF EXISTS enforce_session_tenant();
DROP FUNCTION IF EXISTS enforce_material_tenant();
DROP FUNCTION IF EXISTS enforce_guardian_tenant();
DROP FUNCTION IF EXISTS enforce_speaking_prompt_tenant();
DROP FUNCTION IF EXISTS enforce_speaking_sub_tenant();
DROP FUNCTION IF EXISTS enforce_tuition_tenant();
DROP FUNCTION IF EXISTS enforce_payment_tenant();
DROP FUNCTION IF EXISTS enforce_vnpay_txn_tenant();
DROP FUNCTION IF EXISTS track_storage_usage();
DROP FUNCTION IF EXISTS track_speaking_storage();
DROP FUNCTION IF EXISTS track_video_usage();

-- set_updated_at() KHÔNG xóa — là utility trigger chung (chỉ đặt
-- updated_at = now()), không chứa logic B2B, có thể còn dùng lại cho bảng
-- B2C trong tương lai.

COMMIT;
