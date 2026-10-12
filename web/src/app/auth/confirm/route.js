// GET /auth/confirm — link trong email (đặt lại mật khẩu, xác nhận đăng ký).
//
// Mẫu email (web/public/email-templates/) trỏ link về đây kèm token_hash, server
// verifyOtp rồi set cookie phiên. Không dùng luồng ?code= (PKCE) cho email vì mã
// bí mật PKCE nằm ở nơi gửi yêu cầu: yêu cầu gửi từ app iOS thì Safari/Gmail
// mở link không đổi được code → trước đây rơi về trang chủ, không đặt được mật khẩu.
import { createClient } from "@/lib/supabase/server";
import { parseConfirmParams } from "@/lib/auth/confirm-params";
import { requestOrigin } from "@/lib/auth/request-origin";
import { NextResponse } from "next/server";

export async function GET(request) {
  const origin = requestOrigin(request);
  const params = parseConfirmParams(new URL(request.url).searchParams);

  if (params) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: params.type, token_hash: params.tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${params.next}`);
  }

  const reason = params?.type === "recovery" ? "reset_link_invalid" : "confirm_link_invalid";
  return NextResponse.redirect(`${origin}/login?error=${reason}`);
}
