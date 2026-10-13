// Đo lượt push với 10k người cùng hẹn 20:00 (seed: scripts/push-load-seed.sql).
// CHỈ chạy với Supabase local (đọc web/.env.test.local). Không gọi FCM thật:
// send giả trễ 150 ms, chọn từ giả trễ 300 ms (ước lượng production).
// Chạy: cd web && [PUSH_LOAD_CONCURRENCY=40] node scripts/push-load-check.mjs 2026-10-13T13:00:00Z
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { runDuePushSends } from "../src/lib/push/cron-send-push.js";

const env = Object.fromEntries(readFileSync(new URL("../.env.test.local", import.meta.url), "utf8")
  .split("\n").map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
if (!/localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error("Chỉ chạy với Supabase local");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const at = process.argv[2] ? new Date(process.argv[2]) : new Date();

let t = Date.now();
const { data: due, error } = await supabase.rpc("due_push_slots", { p_now: at.toISOString(), p_catchup_minutes: 30 });
if (error) throw error;
console.log(`due_push_slots: ${due.length} slot trong ${Date.now() - t} ms (mục tiêu < 500 ms)`);

t = Date.now();
const concurrency = Number(process.env.PUSH_LOAD_CONCURRENCY) || 20;
console.log(`song song: ${concurrency}`);
const result = await runDuePushSends(supabase, at, {
  concurrency,
  config: { projectId: "load", serviceAccount: {} },
  tokenProvider: { get: async () => "AT", invalidate() {} },
  send: async () => { await sleep(150); return { ok: true, status: 200, code: null }; },
  selectContent: async () => { await sleep(300); return { words: [{ id: randomUUID(), word: "load", meaning_vi: "tải", step: "due" }] }; },
});
console.log(JSON.stringify({ ...result, wall_ms: Date.now() - t }, null, 2));
console.log("Mục tiêu: duration_ms < 240000, deferred = 0");
