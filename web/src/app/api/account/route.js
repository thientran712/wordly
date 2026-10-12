// DELETE /api/account — người dùng tự xoá tài khoản + toàn bộ dữ liệu.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAccount } from "@/lib/auth/delete-account";

export async function DELETE() {
  // Không xoá không hoàn tác được dựa trên header middleware chuyển xuống —
  // xác thực lại phiên với Supabase Auth ngay tại đây.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await deleteAccount({
    userId: user.id,
    userClient: supabase,
    adminClient: createAdminClient(),
  });
  if (!result.ok) {
    console.error("[account] delete failed", result.error);
    return Response.json({ error: "Không xoá được tài khoản, thử lại sau" }, { status: 500 });
  }
  return Response.json({ success: true });
}
