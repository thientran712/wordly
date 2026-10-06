// Ngữ cảnh tổ chức — lớp phòng vệ số 2 (sau RLS).
//
// Nguồn dữ liệu là claim `user_orgs` trong JWT, do custom access token hook
// nhúng vào (xem supabase/migrations/...orgs_and_memberships.sql). Đọc từ JWT
// nghĩa là không có round-trip mạng nào để biết vai trò — cùng triết lý với
// getUserFast() đang dùng cho identity.
//
// QUAN TRỌNG: các hàm ở đây KHÔNG thay thế RLS. Chúng trả 403 sớm với thông
// báo rõ ràng cho người dùng; RLS mới là thứ thực sự chặn ở tầng database.

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase-server";

export const ORG_ROLES = ["owner", "teacher", "student", "parent"];
const STAFF_ROLES = ["owner", "teacher"];

/**
 * Đọc map { org_id: role } của user hiện tại từ JWT.
 * Trả về {} nếu chưa đăng nhập hoặc không thuộc org nào.
 */
export async function getUserOrgs() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return {};

  const orgs = data.claims.user_orgs;
  // Phòng trường hợp hook chưa được cấu hình hoặc claim sai kiểu
  if (!orgs || typeof orgs !== "object" || Array.isArray(orgs)) return {};
  return orgs;
}

/** Vai trò của user trong một org cụ thể, hoặc null nếu không thuộc org đó. */
export async function getOrgRole(orgId) {
  if (!orgId) return null;
  const orgs = await getUserOrgs();
  return orgs[orgId] || null;
}

/**
 * Guard: yêu cầu user có một trong các vai trò cho trước trong org.
 *
 * Trả về { ok: true, role } hoặc { ok: false, response } — caller trả thẳng
 * `response` về client. Dùng kiểu trả về thay vì throw để route handler
 * không phải bọc try/catch cho luồng thông thường.
 */
export async function requireOrgRole(orgId, allowedRoles = ORG_ROLES) {
  if (!orgId || !isUuid(orgId)) {
    return {
      ok: false,
      response: Response.json({ error: "Thiếu hoặc sai org_id" }, { status: 400 }),
    };
  }

  const role = await getOrgRole(orgId);

  if (!role) {
    // Không tiết lộ org có tồn tại hay không — trả 404 thay vì 403 để
    // người ngoài không dò được danh sách org bằng cách thử id.
    return {
      ok: false,
      response: Response.json({ error: "Không tìm thấy" }, { status: 404 }),
    };
  }

  if (!allowedRoles.includes(role)) {
    return {
      ok: false,
      response: Response.json(
        { error: "Bạn không có quyền thực hiện hành động này" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, role };
}

/** Guard tiện dụng: chỉ owner. */
export function requireOwner(orgId) {
  return requireOrgRole(orgId, ["owner"]);
}

/** Guard tiện dụng: owner hoặc teacher. */
export function requireStaff(orgId) {
  return requireOrgRole(orgId, STAFF_ROLES);
}

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * Lấy user + map org trong một lần, cho các route cần cả hai.
 * Đọc x-user-id do middleware đã xác thực và chuyển tiếp.
 */
export async function getUserWithOrgs() {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) return { user: null, orgs: {} };

  return {
    user: { id: userId, email: h.get("x-user-email") || null },
    orgs: await getUserOrgs(),
  };
}
