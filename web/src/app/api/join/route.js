// POST /api/join — học viên nhập mã lớp để tham gia.
//
// Gọi hàm join_class_by_code() trong Postgres thay vì tự làm nhiều bước từ
// đây: việc kiểm hạn mã, kiểm lượt dùng, tạo membership, thêm vào lớp và
// tăng bộ đếm PHẢI nguyên tử. Chia nhỏ ở tầng ứng dụng sẽ có khe hở race
// khi cả lớp nhập mã cùng lúc.

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";

// Thông báo tiếng Việt cho từng mã lỗi từ hàm SQL.
const ERROR_MESSAGES = {
  not_authenticated: "Bạn cần đăng nhập để tham gia lớp",
  invalid_code: "Mã lớp không đúng hoặc lớp đã đóng",
  code_expired: "Mã lớp đã hết hạn — hãy hỏi giáo viên mã mới",
  code_exhausted: "Mã lớp đã hết lượt sử dụng — hãy hỏi giáo viên mã mới",
  membership_removed: "Bạn đã bị xoá khỏi trung tâm này. Vui lòng liên hệ giáo viên.",
};

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const raw = (body?.code || "").toString().trim().toUpperCase();
  // Bỏ dấu gạch nối người dùng hay tự thêm (WRD-7K2M → WRD7K2M)
  const code = raw.replace(/[\s-]/g, "");

  if (!code || code.length < 4 || code.length > 12 || !/^[A-Z0-9]+$/.test(code)) {
    return Response.json({ error: "Mã lớp không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_class_by_code", { p_code: code });

  if (error) {
    console.error("[api/join] RPC lỗi:", error.message);
    return Response.json({ error: "Không tham gia được lớp" }, { status: 500 });
  }

  if (!data?.ok) {
    const msg = ERROR_MESSAGES[data?.error] || "Không tham gia được lớp";
    // 404 cho mã sai để không tiết lộ mã nào tồn tại; 409 cho các trạng thái khác
    const status = data?.error === "invalid_code" ? 404 : 409;
    return Response.json({ error: msg, code: data?.error }, { status });
  }

  // Ngữ cảnh org nằm trong JWT, nên token hiện tại CHƯA có org mới này.
  // Client phải gọi supabase.auth.refreshSession() sau khi nhận phản hồi.
  return Response.json({
    ok: true,
    org_id: data.org_id,
    class_id: data.class_id,
    class_name: data.class_name,
    needs_session_refresh: true,
  });
}
