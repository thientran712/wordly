// Đăng ký / huỷ FCM token của máy. Ghi qua RPC register_push_device (token
// chuyển sang người đăng ký gần nhất — chống rò thông báo chéo người dùng).
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { validateDeviceBody } from "@/lib/push/validate";

async function limited(userId) {
  const rl = await checkRateLimitDb({ supabase: createSharedClient(), scope: "push-devices", clientKey: userId, limit: 10, windowMs: 60_000 });
  return rl.allowed ? null : rateLimitResponse(rl);
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await limited(user.id);
  if (blocked) return blocked;

  const v = validateDeviceBody(await request.json().catch(() => null));
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_push_device", {
    p_token: v.value.token, p_platform: v.value.platform, p_app_version: v.value.app_version,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await limited(user.id);
  if (blocked) return blocked;

  const { token } = (await request.json().catch(() => null)) || {};
  if (typeof token !== "string" || !token) return Response.json({ error: "Missing token" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("push_devices").delete().eq("token", token).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
