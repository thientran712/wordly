// GET   /api/orgs/[id]/settings — cấu hình + feature + quota
// PATCH /api/orgs/[id]/settings — sửa cấu hình (chỉ owner)

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { requireOwner, requireOrgRole } from "@/lib/org-context";
import {
  getOrgSettings,
  getOrgFeatures,
  setOrgSetting,
  FEATURES,
  PLAN_STORAGE_LIMITS,
} from "@/lib/org-settings";
import { validateSettingsPatch, SETTING_SCHEMA } from "@/lib/settings-validation";

export async function GET(request, { params }) {
  const { id: orgId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Thành viên đọc được cấu hình (UI cần biết để render), chỉ owner sửa.
  const guard = await requireOrgRole(orgId);
  if (!guard.ok) return guard.response;

  const supabase = await createClient();

  const [settings, features, orgRes, usageRes] = await Promise.all([
    getOrgSettings(orgId),
    getOrgFeatures(orgId),
    supabase.from("organizations").select("id, name, slug, plan, status, trial_ends_at").eq("id", orgId).maybeSingle(),
    supabase.from("org_storage_usage").select("bytes_used, bytes_limit").eq("org_id", orgId).maybeSingle(),
  ]);

  if (!orgRes.data) {
    return Response.json({ error: "Không tìm thấy trung tâm" }, { status: 404 });
  }

  const plan = orgRes.data.plan || "basic";
  const usage = usageRes.data || {
    bytes_used: 0,
    bytes_limit: PLAN_STORAGE_LIMITS[plan] ?? PLAN_STORAGE_LIMITS.basic,
  };

  return Response.json({
    org: orgRes.data,
    settings,
    features,
    feature_labels: FEATURES,
    // Schema để UI dựng form tự động — thêm cấu hình mới không phải sửa UI
    schema: SETTING_SCHEMA,
    storage: {
      bytes_used: Number(usage.bytes_used) || 0,
      bytes_limit: Number(usage.bytes_limit) || 0,
    },
    role: guard.role,
  });
}

export async function PATCH(request, { params }) {
  const { id: orgId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const guard = await requireOwner(orgId);
  if (!guard.ok) return guard.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const hasSettings = body?.settings && Object.keys(body.settings).length > 0;
  const hasName = typeof body?.name === "string" && body.name.trim();

  if (!hasSettings && !hasName) {
    return Response.json({ error: "Không có gì để lưu" }, { status: 400 });
  }

  // Validate all-or-nothing: một key sai thì từ chối cả patch, tránh để
  // tổ chức ở trạng thái cấu hình nửa vời. Bỏ qua khi chỉ đổi tên.
  if (hasSettings) {
    const check = validateSettingsPatch(body.settings);
    if (!check.ok) {
      return Response.json({ error: check.errors[0], errors: check.errors }, { status: 400 });
    }

    try {
      // setOrgSetting tự xoá cache sau mỗi lần ghi
      for (const [key, value] of Object.entries(check.valid)) {
        await setOrgSetting(orgId, key, value);
      }
    } catch (e) {
      console.error("[orgs/settings] PATCH lỗi:", e.message);
      return Response.json({ error: "Không lưu được cấu hình" }, { status: 500 });
    }
  }

  // Đổi tên trung tâm (owner được sửa qua RLS organizations_update_owner)
  if (hasName) {
    const name = body.name.trim().slice(0, 200);
    const supabase = await createClient();
    const { error } = await supabase.from("organizations").update({ name }).eq("id", orgId);
    if (error) {
      console.error("[orgs/settings] đổi tên lỗi:", error.message);
      return Response.json({ error: "Không đổi được tên trung tâm" }, { status: 500 });
    }
  }

  return Response.json({ ok: true, settings: await getOrgSettings(orgId) });
}
