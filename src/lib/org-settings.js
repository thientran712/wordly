// Cấu hình & feature flags theo tổ chức.
//
// Quy tắc BẮT BUỘC: không code nào được đọc thẳng bảng org_settings /
// org_features. Tất cả phải qua hàm ở file này, để (a) giá trị mặc định nằm
// một chỗ duy nhất, và (b) thêm cấu hình mới không phải sửa rải rác.
//
// Đây là câu trả lời cho "mỗi trung tâm có nhu cầu hơi khác nhau": khác biệt
// được giải bằng DỮ LIỆU, không phải bằng code riêng cho từng khách.

import { createAdminClient } from "@/lib/supabase-admin";

// ── Giá trị mặc định ────────────────────────────────────────────────────────
// Trung tâm mới hoạt động ngay với bộ này; chỉ ghi vào DB khi họ muốn khác.
export const DEFAULT_SETTINGS = {
  // Ngưỡng phân loại học viên trên dashboard (đơn vị: ngày không hoạt động)
  active_threshold_days: 3,
  stalled_threshold_days: 7,

  // Giờ gửi email mặc định cho học viên mới của trung tâm
  default_email_times: ["08:00"],

  // Thang điểm: 'ten' (thang 10) | 'ielts' (band 9.0) | 'percent'
  grading_scale: "ten",

  // Số từ mới mỗi ngày mặc định khi giao bài
  default_daily_words: 5,

  // Ngày bắt đầu tuần: 0=CN, 1=T2 (VN thường dùng T2)
  week_starts_on: 1,

  // Mã lớp: hạn dùng và số lượt tối đa
  join_code_ttl_days: 30,
  join_code_max_uses: 50,
};

// ── Feature flags ───────────────────────────────────────────────────────────
// Vừa là cơ chế khả biến, vừa là cơ chế BÁN GÓI. Ghi chỉ qua service role —
// owner của trung tâm không tự bật được tính năng trả phí.
export const FEATURES = {
  lesson_library: "Thư viện bài giảng",
  vocabulary_assignments: "Giao bộ từ vựng",
  progress_dashboard: "Dashboard tiến độ",
  speaking_review: "Chấm bài nói",       // GĐ4
  homework: "Bài tập về nhà",             // GĐ2
  quiz_games: "Quiz & game",              // GĐ2
  parent_reports: "Báo cáo phụ huynh",   // GĐ3
  tuition: "Quản lý học phí",             // GĐ4
};

// Gói dịch vụ → feature bật sẵn. Đây là bảng giá dưới dạng code.
export const PLAN_FEATURES = {
  basic: ["progress_dashboard", "vocabulary_assignments"],
  pro: ["progress_dashboard", "vocabulary_assignments", "lesson_library", "homework", "quiz_games"],
  enterprise: Object.keys(FEATURES),
};

export const PLAN_STORAGE_LIMITS = {
  basic: 5 * 1024 ** 3,        // 5GB
  pro: 50 * 1024 ** 3,         // 50GB
  enterprise: 500 * 1024 ** 3, // 500GB
};

// ── Cache trong tiến trình ──────────────────────────────────────────────────
// Cấu hình đổi rất ít nhưng được đọc rất nhiều. Cache 60s ở module scope —
// cùng kỹ thuật mà api/tts đang dùng cho OAuth token.
const CACHE_TTL_MS = 60_000;
const cache = new Map(); // orgId -> { settings, features, expiresAt }

function readCache(orgId) {
  const hit = cache.get(orgId);
  if (hit && Date.now() < hit.expiresAt) return hit;
  return null;
}

/** Xoá cache của một org — gọi sau khi ghi cấu hình. */
export function invalidateOrgCache(orgId) {
  cache.delete(orgId);
}

async function loadOrg(orgId) {
  const cached = readCache(orgId);
  if (cached) return cached;

  const supabase = createAdminClient();
  const [{ data: settingRows }, { data: featureRows }, { data: org }] = await Promise.all([
    supabase.from("org_settings").select("key, value").eq("org_id", orgId),
    supabase.from("org_features").select("feature_key, enabled").eq("org_id", orgId),
    // organizations khoá theo `id`, không phải `org_id`
    supabase.from("organizations").select("plan, status").eq("id", orgId).maybeSingle(),
  ]);

  const settings = { ...DEFAULT_SETTINGS };
  for (const row of settingRows || []) {
    settings[row.key] = row.value;
  }

  // Feature: mặc định theo gói, rồi để hàng trong DB ghi đè
  const plan = org?.plan || "basic";
  const features = {};
  for (const key of Object.keys(FEATURES)) {
    features[key] = (PLAN_FEATURES[plan] || PLAN_FEATURES.basic).includes(key);
  }
  for (const row of featureRows || []) {
    features[row.feature_key] = row.enabled;
  }

  const entry = { settings, features, plan, expiresAt: Date.now() + CACHE_TTL_MS };
  cache.set(orgId, entry);
  return entry;
}

/** Đọc một cấu hình, tự trả mặc định nếu org chưa đặt. */
export async function getOrgSetting(orgId, key) {
  if (!(key in DEFAULT_SETTINGS)) {
    // Sai chính tả key là lỗi lập trình — báo sớm thay vì trả undefined âm thầm
    throw new Error(`Cấu hình không tồn tại: "${key}". Thêm vào DEFAULT_SETTINGS trước.`);
  }
  const { settings } = await loadOrg(orgId);
  return settings[key];
}

/** Đọc toàn bộ cấu hình (đã trộn mặc định) — dùng cho trang cài đặt. */
export async function getOrgSettings(orgId) {
  const { settings } = await loadOrg(orgId);
  return settings;
}

/** Tính năng này có bật cho org không? */
export async function isFeatureEnabled(orgId, featureKey) {
  if (!(featureKey in FEATURES)) {
    throw new Error(`Feature không tồn tại: "${featureKey}"`);
  }
  const { features } = await loadOrg(orgId);
  return features[featureKey] === true;
}

/** Toàn bộ trạng thái feature — dùng cho UI ẩn/hiện menu. */
export async function getOrgFeatures(orgId) {
  const { features } = await loadOrg(orgId);
  return features;
}

/**
 * Guard cho route: chặn nếu tính năng chưa bật cho org.
 * Trả về null nếu được phép, hoặc Response 403 kèm gợi ý nâng gói.
 */
export async function requireFeature(orgId, featureKey) {
  const enabled = await isFeatureEnabled(orgId, featureKey);
  if (enabled) return null;
  return Response.json(
    {
      error: `Tính năng "${FEATURES[featureKey]}" không có trong gói hiện tại`,
      feature: featureKey,
      upgrade_required: true,
    },
    { status: 403 }
  );
}

/** Ghi cấu hình (chỉ owner — quyền đã kiểm ở tầng route + RLS). */
export async function setOrgSetting(orgId, key, value) {
  if (!(key in DEFAULT_SETTINGS)) {
    throw new Error(`Cấu hình không tồn tại: "${key}"`);
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("org_settings")
    .upsert({ org_id: orgId, key, value }, { onConflict: "org_id,key" });
  if (error) throw new Error(`Lưu cấu hình thất bại: ${error.message}`);
  invalidateOrgCache(orgId);
}
