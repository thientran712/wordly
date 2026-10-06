// GET  /api/classes?org_id=... — danh sách lớp
// POST /api/classes             — tạo lớp mới (owner hoặc teacher)

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { requireStaff, requireOrgRole, isUuid } from "@/lib/org-context";
import { getOrgSetting } from "@/lib/org-settings";

// Bộ ký tự bỏ các cặp dễ đọc lẫn (0/O, 1/I/L) — mã lớp thường được đọc to
// trên lớp hoặc viết lên bảng nên phải chống nghe/đọc sai.
const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY2346789";

function generateJoinCode(len = 6) {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = new URL(request.url).searchParams.get("org_id");
  const guard = await requireOrgRole(orgId);
  if (!guard.ok) return guard.response;

  const supabase = await createClient();

  // RLS lo việc lọc: staff thấy mọi lớp trong org, HV chỉ thấy lớp mình học.
  const { data, error } = await supabase
    .from("classes")
    .select(`
      id, name, description, status, created_at,
      join_code, join_code_expires_at, join_code_max_uses, join_code_uses,
      teacher_membership_id,
      class_members(count)
    `)
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/classes] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được danh sách lớp" }, { status: 500 });
  }

  // Học viên không cần thấy mã lớp — chỉ staff dùng để mời.
  const isStaff = guard.role === "owner" || guard.role === "teacher";
  const classes = (data || []).map((c) => {
    const memberCount = c.class_members?.[0]?.count ?? 0;
    const base = {
      id: c.id,
      name: c.name,
      description: c.description,
      status: c.status,
      created_at: c.created_at,
      member_count: memberCount,
      teacher_membership_id: c.teacher_membership_id,
    };
    if (!isStaff) return base;
    return {
      ...base,
      join_code: c.join_code,
      join_code_expires_at: c.join_code_expires_at,
      join_code_uses: c.join_code_uses,
      join_code_max_uses: c.join_code_max_uses,
    };
  });

  return Response.json({ classes, role: guard.role });
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { org_id, name, description } = body || {};

  const guard = await requireStaff(org_id);
  if (!guard.ok) return guard.response;

  const trimmedName = (name || "").trim();
  if (!trimmedName || trimmedName.length > 200) {
    return Response.json({ error: "Tên lớp phải từ 1 đến 200 ký tự" }, { status: 400 });
  }

  const supabase = await createClient();

  // Tìm membership của người tạo để gán làm GV phụ trách.
  const { data: myMembership } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const ttlDays = await getOrgSetting(org_id, "join_code_ttl_days");
  const maxUses = await getOrgSetting(org_id, "join_code_max_uses");
  const expiresAt = new Date(Date.now() + ttlDays * 86400_000).toISOString();

  // Mã lớp là UNIQUE toàn hệ thống nên có thể trùng — thử lại vài lần.
  let created = null;
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("classes")
      .insert({
        org_id,
        name: trimmedName,
        description: description?.trim() || null,
        teacher_membership_id: myMembership?.id || null,
        join_code: generateJoinCode(),
        join_code_expires_at: expiresAt,
        join_code_max_uses: maxUses,
      })
      .select("id, name, description, status, join_code, join_code_expires_at, join_code_max_uses")
      .single();

    if (!error) {
      created = data;
      break;
    }
    lastError = error;
    // 23505 = unique_violation → mã trùng, sinh mã khác rồi thử lại
    if (error.code !== "23505") break;
  }

  if (!created) {
    console.error("[api/classes] POST lỗi:", lastError?.message);
    return Response.json({ error: "Không tạo được lớp" }, { status: 500 });
  }

  // Tự thêm người tạo vào lớp với vai trò teacher để họ thấy lớp ngay.
  if (myMembership?.id) {
    await supabase.from("class_members").insert({
      class_id: created.id,
      membership_id: myMembership.id,
      org_id,
      role_in_class: "teacher",
    });
  }

  return Response.json({ class: created }, { status: 201 });
}
