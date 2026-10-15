// Lịch widget 48 giờ tới (spec 2026-10-15 §3) — thay /api/widget/log-shown
// (log cả pool một lúc, làm push xoay vòng sai). App gửi lại mỗi khi tính lại
// widget; entries rỗng = chưa thêm widget nào → chỉ xoá lịch tương lai.
// Client người dùng (RLS): người dùng chỉ ghi/xoá được lịch của mình.
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { validateScheduleBody } from "@/lib/widget/schedule";

export async function PUT(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const shared = createSharedClient();
  const rl = await checkRateLimitDb({ supabase: shared, scope: "widget-schedule", clientKey: user.id, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const now = new Date();
  const v = validateScheduleBody(await request.json().catch(() => null), now);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

  const supabase = await createClient();
  let rows = v.value;

  // FK không kiểm quyền sở hữu (FK bỏ qua RLS) → chỉ giữ id từ đã lưu CỦA
  // người này; id kho phải còn trong kho, nếu không FK làm hỏng cả lô INSERT.
  const entryIds = [...new Set(rows.map((r) => r.entry_id).filter(Boolean))];
  const bankIds = [...new Set(rows.map((r) => r.bank_word_id).filter(Boolean))];
  const [own, bank] = await Promise.all([
    entryIds.length
      ? supabase.from("translate_history").select("id").eq("user_id", user.id).in("id", entryIds)
      : { data: [] },
    bankIds.length ? shared.from("words").select("id").in("id", bankIds) : { data: [] },
  ]);
  if (own.error) return Response.json({ error: own.error.message }, { status: 500 });
  if (bank.error) return Response.json({ error: bank.error.message }, { status: 500 });
  const ownSet = new Set((own.data || []).map((r) => r.id));
  const bankSet = new Set((bank.data || []).map((r) => r.id));
  rows = rows.filter((r) => (r.entry_id ? ownSet.has(r.entry_id) : bankSet.has(r.bank_word_id)));

  // Lịch gửi sau cùng thắng: xoá phần tương lai rồi chèn lại. Dòng đã qua giữ
  // nguyên — push cần "đã hiện 6–48 giờ trước", cron chép sang "Đã nhắc".
  // Lịch mới có thể bắt đầu trước now (slot đang hiện) → xoá từ mốc sớm nhất.
  const from = rows.reduce((min, r) => (r.shown_at < min ? r.shown_at : min), now.toISOString());
  const del = await supabase.from("widget_schedule").delete().eq("user_id", user.id).gte("shown_at", from).eq("logged", false);
  if (del.error) return Response.json({ error: del.error.message }, { status: 500 });

  if (rows.length) {
    // Slot đã qua mà cron đã chép (logged) không bị xoá ở trên → bỏ qua dòng
    // trùng thay vì chèn lại, để "Đã nhắc" không ghi một slot hai lần.
    const { error } = await supabase.from("widget_schedule")
      .upsert(rows.map((r) => ({ user_id: user.id, ...r })), { onConflict: "user_id,shown_at,entry_id,bank_word_id", ignoreDuplicates: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ saved: rows.length, dropped: v.dropped + (v.value.length - rows.length) });
}
