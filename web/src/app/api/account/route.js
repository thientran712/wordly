// DELETE /api/account — người dùng tự xoá tài khoản + toàn bộ dữ liệu.
//
// Body tuỳ chọn: { "appleAuthorizationCode": "<code>" } — app iOS gửi kèm
// khi người dùng đăng nhập bằng Apple để server thu hồi token Apple trước
// khi xoá (Guideline 5.1.1(v)). Bản app cũ không gửi body → vẫn chạy như cũ.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAccount } from "@/lib/auth/delete-account";
import {
  decideAppleRevoke,
  parseDeleteAccountBody,
  readAppleConfig,
  revokeAppleAuthorization,
} from "@/lib/auth/apple-revoke";

export async function DELETE(request) {
  // Không xoá không hoàn tác được dựa trên header middleware chuyển xuống —
  // xác thực lại phiên với Supabase Auth ngay tại đây.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch {
    // Body đọc lỗi = coi như không có code.
  }
  const decision = decideAppleRevoke({ user, code: parseDeleteAccountBody(bodyText) });

  // Thu hồi Apple trước khi xoá; lỗi thì chỉ log, vẫn xoá — quyền xoá tài
  // khoản không được phụ thuộc Apple. Không log code/token/secret.
  if (decision.action === "revoke") {
    const revoke = await revokeAppleAuthorization({
      code: decision.code,
      config: readAppleConfig(process.env),
      fetch,
    });
    if (!revoke.ok) {
      console.error(`[account] apple revoke failed step=${revoke.step} status=${revoke.status} error=${revoke.error}`);
    }
  } else if (decision.action === "warn-missing-code") {
    console.warn("[account] apple user deleted without authorization code — token not revoked");
  }

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
