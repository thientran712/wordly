// Chọn từ cho một push nhắc ôn — spec 2026-10-15-shared-word-source-design.md §4.
//
// Pool = cùng luật với widget (lib/word-source/pool.js), nên push và widget
// không còn lệch nguồn. Thứ tự xoay vòng CHỈ theo lịch sử push (suggestion_log
// source = push): log widget cũ ghi cả pool một lúc nên không dùng được để xếp
// thứ tự (lỗi 15/10). Thông tin widget lấy từ widget_schedule — lịch thật app
// gửi lên — chỉ để (a) tránh gửi đúng từ đang trên widget và (b) ưu tiên từ
// widget đã hiện 6–48 giờ trước (nhắc lại đúng lúc sắp quên).
//
// Push KHÔNG đổi lịch ôn của từ (nhận thông báo ≠ đã ôn).
import { buildPool } from "../word-source/pool.js";

/** Cửa sổ lịch sử push để xếp thứ tự — quá cửa sổ coi như chưa push. */
export const SHOWN_WINDOW_DAYS = 60;
const MAX_ROWS = 1000;
/** Cùng số từ đã lưu app đồng bộ cho widget (/api/translate-history?saved=1&limit=200) */
export const SAVED_WORDS_LIMIT = 200;
const H = 60 * 60 * 1000;

/** Map id → lần hiện gần nhất (ms) từ các dòng có shown_at. */
export function lastShownMap(logRows, key) {
  const m = new Map();
  for (const r of logRows || []) {
    const id = r?.[key];
    if (id == null) continue;
    const t = r.shown_at ? Date.parse(r.shown_at) : Date.now();
    if (!(m.get(id) >= t)) m.set(id, t);
  }
  return m;
}

/**
 * Quyết định thuần (không I/O) — trả danh sách phương án theo thứ tự thử:
 *   { step, id }                     từ của bạn (id translate_history)
 *   { step, bank: true, avoidBankIds } lấy một từ kho (nơi gọi tải kho)
 * Phương án kho có thể hỏng (kho lỗi/hết) nên đi kèm phương án dự phòng.
 * Mảng rỗng = không có gì để gửi (không xảy ra khi còn từ kho).
 *
 * personal: từ của bạn theo thứ tự lưu (cũ trước); pinnedIds: id ghim hợp lệ;
 * usesBank: pool có trộn kho; schedule: dòng widget_schedule; pushLog: dòng
 * suggestion_log source = push.
 */
export function planPushWord({ now, personal, pinnedIds, usesBank, schedule, pushLog }) {
  const t = now.getTime();
  const pinned = new Set(pinnedIds || []);
  const lastPush = lastShownMap(pushLog, "entry_id");
  const recentBank = [...lastShownMap(pushLog, "bank_word_id").keys()];
  const rows = (schedule || []).map((r) => ({ ...r, t: Date.parse(r.shown_at) }));

  // Còn dòng tương lai = app đang gửi lịch (có widget, mở app trong 48 giờ).
  // Không có → bỏ bước Loại và bước 1: dòng cũ không còn nói gì về widget.
  const hasSchedule = rows.some((r) => r.t > t);

  // Loại: đang/vừa hiện (2 giờ qua) + sắp hiện (5 phút tới, push và widget
  // đổi từ cùng mốc giờ tròn).
  const onWidget = hasSchedule ? rows.filter((r) => r.t >= t - 2 * H && r.t <= t + 5 * 60 * 1000) : [];
  const excluded = new Set(onWidget.map((r) => r.entry_id).filter(Boolean));
  const avoidBankIds = [...new Set([...recentBank, ...onWidget.map((r) => r.bank_word_id).filter(Boolean)])];

  const order = new Map((personal || []).map((w, i) => [w.id, i]));
  const pushed = (id) => lastPush.get(id) ?? -Infinity; // chưa từng push = lên đầu
  const byLeastPushed = (a, b) => pushed(a.id) - pushed(b.id) || order.get(a.id) - order.get(b.id);

  const candidates = (personal || []).filter((w) => !excluded.has(w.id));
  if (candidates.length) {
    if (hasSchedule) {
      const seen = lastShownMap(rows.filter((r) => r.t >= t - 48 * H && r.t <= t - 6 * H), "entry_id");
      const step1 = candidates
        .filter((w) => seen.has(w.id) && pushed(w.id) < seen.get(w.id))
        .sort((a, b) => (pinned.has(b.id) - pinned.has(a.id)) || byLeastPushed(a, b) || seen.get(a.id) - seen.get(b.id));
      if (step1.length) return [{ step: 1, id: step1[0].id }];
    }
    const pinnedFresh = candidates.filter((w) => pinned.has(w.id) && pushed(w.id) < t - 24 * H).sort(byLeastPushed);
    if (pinnedFresh.length) return [{ step: 2, id: pinnedFresh[0].id }];
    return [{ step: 2, id: [...candidates].sort(byLeastPushed)[0].id }];
  }

  // Chưa có từ nào của bạn → kho, kể cả khi tắt trộn (đã bật nhắc ôn thì phải có gì đó)
  if (!personal?.length) return [{ step: 5, bank: true, avoidBankIds }];

  // Mọi từ của bạn đang trên widget: thử từ kho (nếu trộn), không được thì
  // chấp nhận trùng widget còn hơn bỏ lượt.
  const plan = [];
  if (usesBank) plan.push({ step: 3, bank: true, avoidBankIds });
  plan.push({ step: 4, id: [...personal].sort(byLeastPushed)[0].id });
  return plan;
}

/**
 * Một từ cho push: { id, word, meaning, fromBank, step } hoặc null (bỏ lượt).
 * `supabase` là admin client của cron (đọc dữ liệu nhiều người dùng).
 */
export async function selectPushWord(supabase, userId, now, { selectBank }) {
  const t = now.getTime();
  const [settings, saved, schedule, pushLog] = await Promise.all([
    supabase.from("word_source_settings")
      .select("include_saved, include_bank, pinned_ids, pinned_only")
      .eq("user_id", userId).maybeSingle(),
    supabase.from("translate_history")
      .select("id, source_text, translated_text, saved_at")
      .eq("user_id", userId).eq("direction", "EN→VI").eq("is_saved", true).is("deleted_at", null)
      .order("saved_at", { ascending: false }).limit(SAVED_WORDS_LIMIT),
    // Lấy cả dòng tương lai: cần biết app còn gửi lịch không (bước Loại/1)
    supabase.from("widget_schedule")
      .select("shown_at, entry_id, bank_word_id")
      .eq("user_id", userId).gte("shown_at", new Date(t - 48 * H).toISOString())
      .order("shown_at", { ascending: true }).limit(MAX_ROWS),
    supabase.from("suggestion_log")
      .select("entry_id, bank_word_id, shown_at")
      .eq("user_id", userId).eq("source", "push")
      .gte("shown_at", new Date(t - SHOWN_WINDOW_DAYS * 24 * H).toISOString())
      // Mới nhất trước: PostgREST cắt ở 1000 dòng — thiếu lần push gần đây là lặp từ
      .order("shown_at", { ascending: false }).limit(MAX_ROWS),
  ]);
  // Đọc lỗi (tạm thời) → bỏ lượt, lần cron sau thử lại; không đoán bừa thành
  // "chưa lưu từ nào" rồi gửi từ kho, hay mất thứ tự xoay vòng.
  if (saved.error || pushLog.error) return null;

  const savedWords = (saved.data || []).map((r) => ({ id: r.id, word: r.source_text, meaning: r.translated_text || "" }));
  // Pool không cần lô kho ở đây: kho chỉ tải khi kế hoạch cần (tiết kiệm truy vấn)
  const pool = buildPool(settings.data, savedWords, []);
  const plan = planPushWord({
    now,
    personal: pool.personal,
    pinnedIds: pool.pinned.map((w) => w.id),
    usesBank: pool.usesBank,
    schedule: schedule.data || [],
    pushLog: pushLog.data || [],
  });

  const byId = new Map(savedWords.map((w) => [w.id, w]));
  for (const option of plan) {
    if (!option.bank) {
      const w = byId.get(option.id);
      return { id: w.id, word: w.word, meaning: w.meaning, fromBank: false, step: option.step };
    }
    const [bank] = await selectBank(supabase, userId, { count: 1, recentIds: option.avoidBankIds }).catch(() => []);
    if (bank) return { id: bank.id, word: bank.word, meaning: bank.meaning_vi || "", fromBank: true, step: option.step };
  }
  return null;
}
