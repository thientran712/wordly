// Lượt gửi push — cron VPS gọi qua /api/cron/send-emails mỗi 5 phút (spec
// 2026-10-13). Postgres chọn slot tới giờ (due_push_slots, cửa sổ bù 30 phút),
// mỗi slot GIÀNH QUYỀN bằng INSERT push_log unique (slot_id, send_date) trước
// khi gửi → hai lượt chạy chồng không gửi đôi. Chạy song song qua runPool.
import { selectBankWords } from "../email/select-word-for-email.js";
import { selectPushWord } from "./select-push-word.js";
import { buildPushMessage } from "./build-message.js";
import { sendFcmMessage, isDeadToken, isFatal } from "./fcm-client.js";
import { createGoogleTokenProvider } from "./google-access-token.js";
import { loadFcmConfig } from "./fcm-config.js";
import { runPool } from "./run-pool.js";
import { billingEnforced } from "../billing/plan.js";

export const CATCHUP_MINUTES = 30;

// Access token sống 1 giờ — giữ giữa các lượt cron trong cùng container.
let sharedProvider = null;
function defaultProvider(config) {
  sharedProvider ??= createGoogleTokenProvider({ serviceAccount: config.serviceAccount });
  return sharedProvider;
}

export async function runDuePushSends(supabase, now = new Date(), deps = {}) {
  const started = Date.now();
  const config = "config" in deps ? deps.config : loadFcmConfig();
  if (!config) return { disabled: true };

  const provider = deps.tokenProvider || defaultProvider(config);
  const send = deps.send || sendFcmMessage;
  // Chọn từ theo nguồn từ chung + lịch widget (select-push-word.js, spec 2026-10-15 §4)
  const selectWord = deps.selectWord || selectPushWord;
  const selectBank = deps.selectBank || selectBankWords;
  // Wordly Pro (spec 2026-10-16 §3): đang chặn → người miễn phí chỉ nhận khung
  // sớm nhất (lọc trong SQL). Tắt → gọi y như cũ để chạy được cả khi DB chưa
  // có migration 20261016000200.
  const freeOneSlot = "billingEnforced" in deps ? deps.billingEnforced : billingEnforced();

  const stats = { due: 0, sent: 0, skipped: 0, failed: 0, claimed_elsewhere: 0, tokens_removed: 0 };
  let fatal = null;
  let claimed = 0; // slot lượt này đã giành được — đo tiến độ mỗi lô

  const pool = { failed: 0, deferred: 0, errors: [] };

  // Không lấy được access token (service account bị thu hồi, lệch giờ, mạng)
  // = lỗi cấu hình: dừng cả lượt. Lấy TRƯỚC khi giành slot nào để lượt sau
  // còn gửi bù được; giữa lượt mà hỏng thì đánh dấu fatal.
  async function accessToken() {
    try {
      return await provider.get();
    } catch (e) {
      fatal ??= "TOKEN";
      if (pool.errors.length < 5) pool.errors.push(e?.message || String(e));
      return null;
    }
  }

  async function deliver(message) {
    const call = async () => {
      const token = await accessToken();
      if (!token) return { ok: false, status: 0, code: "TOKEN", message: "" };
      return send({ projectId: config.projectId, accessToken: token, message });
    };
    let r = await call();
    if (r.status === 401 && r.code !== "THIRD_PARTY_AUTH_ERROR") {
      provider.invalidate();
      r = await call();
    }
    return r;
  }

  async function handle({ slot_id, user_id, send_date }) {
    const claim = await supabase.from("push_log").insert({ slot_id, user_id, send_date, status: "sending" });
    if (claim.error) {
      if (claim.error.code === "23505") { stats.claimed_elsewhere++; return; }
      throw new Error(`push_log claim: ${claim.error.message}`);
    }
    claimed++;
    const finish = (fields) => supabase.from("push_log").update(fields).eq("slot_id", slot_id).eq("send_date", send_date);

    // Đọc thiết bị ĐÚNG LÚC gửi — token đã chuyển sang người khác thì không còn ở đây
    const { data: devices } = await supabase.from("push_devices").select("id, token").eq("user_id", user_id);
    if (!devices?.length) { stats.skipped++; await finish({ status: "skipped", error: "no devices" }); return; }

    const word = await selectWord(supabase, user_id, now, { selectBank });
    if (!word) { stats.skipped++; await finish({ status: "skipped", error: "Nothing to send — both queues empty" }); return; }

    let delivered = 0;
    let lastError = null;
    for (const d of devices) {
      if (fatal) break;
      const r = await deliver(buildPushMessage({ token: d.token, word, now, seed: slot_id }));
      if (r.ok) { delivered++; continue; }
      lastError = r.code;
      if (isDeadToken(r)) {
        await supabase.from("push_devices").delete().eq("id", d.id);
        stats.tokens_removed++;
      } else if (isFatal(r)) {
        fatal = r.code;
      }
    }

    await finish({ status: delivered ? "sent" : "failed", devices: delivered, entry_ids: [word.id], error: delivered ? null : lastError });
    if (!delivered) { stats.failed++; return; }
    stats.sent++;
    const row = word.fromBank
      ? { user_id, source: "push", entry_type: "bank", bank_word_id: word.id }
      : { user_id, source: "push", entry_type: "translate_history", entry_id: word.id };
    const { error: logError } = await supabase.from("suggestion_log").insert(row);
    if (logError) console.error(`[cron-send-push] suggestion_log (không fatal): ${logError.message}`);
  }

  // PostgREST cắt mọi kết quả ở max_rows (1000) — kể cả RPC. Gọi lại theo lô:
  // slot đã giành quyền có push_log nên lô sau tự loại ra. Dừng khi hết slot,
  // hết thời gian, lỗi cấu hình, hoặc một lô không giành được slot nào (tránh
  // lặp vô hạn khi lỗi claim/tranh chấp).
  const budgetMs = deps.budgetMs ?? 240_000;
  let budgetExhausted = false;
  await accessToken();
  for (;;) {
    if (fatal !== null) break;
    if (Date.now() - started >= budgetMs) { budgetExhausted = true; break; }
    const { data: due, error } = await supabase.rpc("due_push_slots", {
      p_now: now.toISOString(), p_catchup_minutes: CATCHUP_MINUTES,
      ...(freeOneSlot && { p_free_one_slot: true }),
    });
    if (error) throw new Error(`due_push_slots: ${error.message}`);
    if (!due.length) break;
    stats.due += due.length;
    const before = claimed;
    const r = await runPool(due, handle, {
      concurrency: deps.concurrency ?? 20,
      budgetMs: budgetMs - (Date.now() - started),
      shouldStop: () => fatal !== null,
    });
    pool.failed += r.failed;
    pool.deferred = r.deferred;
    pool.errors.push(...r.errors.slice(0, 5 - pool.errors.length));
    if (claimed === before) break;
  }
  const { data: cleaned } = await supabase.rpc("cleanup_push_data", { p_log_days: 30, p_device_days: 270, p_limit: 5000 });

  return {
    ...stats,
    failed: stats.failed + pool.failed,
    deferred: pool.deferred,
    budget_exhausted: budgetExhausted || (fatal === null && pool.deferred > 0),
    fatal,
    errors: pool.errors,
    cleaned: cleaned ?? null,
    duration_ms: Date.now() - started,
  };
}
