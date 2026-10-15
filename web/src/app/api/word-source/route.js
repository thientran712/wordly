// Nguồn từ dùng chung cho widget + push (spec 2026-10-15 §2.3). Server là nguồn
// sự thật; app giữ bản sao trên máy và so updated_at khi mở app (nhiều máy).
// Client người dùng (RLS) — bảng chỉ có dòng của chính người đó.
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { normalizeWordSource, validateWordSourceBody } from "@/lib/word-source/pool";

const FIELDS = "include_saved, include_bank, pinned_ids, pinned_only, updated_at";

const toResponse = (row) => ({ settings: normalizeWordSource(row), updated_at: row?.updated_at ?? null });

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("word_source_settings").select(FIELDS).eq("user_id", user.id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // Chưa có dòng → mặc định, updated_at null: app biết server chưa có gì để
  // ghi đè bản máy (và nên gửi bản máy lên, ví dụ sau khi chuyển cài đặt cũ).
  return Response.json(toResponse(data));
}

export async function PUT(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await checkRateLimitDb({ supabase: createSharedClient(), scope: "word-source", clientKey: user.id, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const v = validateWordSourceBody(await request.json().catch(() => null));
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.from("word_source_settings")
    .upsert({ user_id: user.id, ...v.value, updated_at: new Date().toISOString() })
    .select(FIELDS).single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(toResponse(data));
}
