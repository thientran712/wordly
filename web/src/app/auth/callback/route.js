import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams, origin: fallbackOrigin } = new URL(request.url);
  // Sau nginx (self-host VPS), request.url phản ánh host nội bộ Next.js
  // server nhìn thấy (vd. hostname container), không phải domain thật —
  // Vercel tự xử lý đúng nên lỗi này không lộ ra trước đây. Ưu tiên
  // X-Forwarded-Host/-Proto do nginx gắn.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : fallbackOrigin;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
