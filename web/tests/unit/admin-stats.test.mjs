// Thống kê cho chủ dự án (spec 2026-10-16-admin-stats-design.md) — logic thuần.
import test from "node:test";
import assert from "node:assert/strict";
import { signStatsToken, verifyStatsToken } from "../../src/lib/admin/stats-token.js";
import { renderDailyReport, renderStatsPage, pct } from "../../src/lib/admin/stats-render.js";

const SECRET = "test-secret";
const NOW = new Date("2026-10-16T01:00:00Z");

test("token link thống kê: đúng khoá + còn hạn mới hợp lệ", () => {
  const t = signStatsToken({ secret: SECRET, now: NOW, days: 7 });
  assert.equal(verifyStatsToken(t, { secret: SECRET, now: NOW }), true);
  assert.equal(verifyStatsToken(t, { secret: SECRET, now: new Date("2026-10-22T23:00:00Z") }), true, "còn trong 7 ngày");
  assert.equal(verifyStatsToken(t, { secret: SECRET, now: new Date("2026-10-23T02:00:00Z") }), false, "hết hạn");
  assert.equal(verifyStatsToken(t, { secret: "khoa-khac", now: NOW }), false, "sai khoá");
  const [exp, sig] = t.split(".");
  assert.equal(verifyStatsToken(`${Number(exp) + 86400}.${sig}`, { secret: SECRET, now: NOW }), false, "sửa hạn → chữ ký sai");
  for (const bad of [undefined, "", "abc", "1.2.3", ".", "x.y"]) {
    assert.equal(verifyStatsToken(bad, { secret: SECRET, now: NOW }), false, String(bad));
  }
  assert.equal(verifyStatsToken(t, { secret: "", now: NOW }), false, "server thiếu khoá → không cho xem");
});

const STATS = {
  generated_at: "2026-10-16T01:00:00Z",
  users: { total: 50, new_1d: 3, new_7d: 7, new_30d: 8, dau: 4, wau: 9, mau: 12 },
  retention: { d1: { cohort: 10, returned: 4 }, d7: { cohort: 0, returned: 0 } },
  series: [{ day: "2026-10-14", new_users: 2, active: 3 }, { day: "2026-10-15", new_users: 3, active: 4 }],
  features: { saved_total: 123, savers: 6, saved_new_1d: 5, quiz_1d: 2, widget_users_7d: 3, push_enabled: 2, push_sent_1d: 3 },
  limits_yesterday: { advanced_translate: 1, dictionary: 0, saved_words: 2 },
  pro: { yearly: 1, monthly: 2, sandbox: 1 },
  builds: [{ build: 22, users: 5 }, { build: null, users: 2 }],
  server: { disk_pct: 35, mem_mb: 1850, problems: [], checked_at: "2026-10-16T00:45:00Z" },
};

test("pct: chia an toàn, làm tròn", () => {
  assert.equal(pct(4, 10), "40%");
  assert.equal(pct(0, 0), "—", "chưa có nhóm → không chia cho 0");
  assert.equal(pct(1, 3), "33%");
});

test("email báo cáo sáng: tiêu đề có số chính, nội dung đủ mục, có link", () => {
  const r = renderDailyReport(STATS, { link: "https://x/api/admin/stats?t=abc" });
  assert.match(r.subject, /Wordly/);
  assert.match(r.subject, /3 người mới/);
  assert.match(r.subject, /4 người dùng/);
  for (const s of ["Tổng tài khoản: 50", "Quay lại ngày 1: 40%", "Pro đang trả tiền: 3", "Chạm giới hạn hôm qua", "Ổ đĩa 35%", "https://x/api/admin/stats?t=abc"]) {
    assert.ok(r.text.includes(s), `thiếu "${s}" trong:\n${r.text}`);
  }
  assert.ok(r.html.includes("https://x/api/admin/stats?t=abc"));
});

test("email báo cáo: server có sự cố → nói rõ", () => {
  const r = renderDailyReport({ ...STATS, server: { ...STATS.server, problems: ["Ổ đĩa đã dùng 90%"] } }, { link: "l" });
  assert.match(r.subject, /⚠️/);
  assert.ok(r.text.includes("Ổ đĩa đã dùng 90%"));
});

test("email báo cáo: chưa có tình trạng server (watchdog chưa gửi) → không vỡ", () => {
  const r = renderDailyReport({ ...STATS, server: null }, { link: "l" });
  assert.ok(r.text.includes("Chưa có dữ liệu server"));
});

test("trang thống kê: escape HTML, có các khối chính", () => {
  const html = renderStatsPage({ ...STATS, server: { ...STATS.server, problems: ["<script>alert(1)</script>"] } });
  assert.ok(!html.includes("<script>alert(1)</script>"), "phải escape");
  assert.ok(html.includes("&lt;script&gt;"));
  for (const s of ["Người dùng", "Giữ chân", "Tính năng", "Wordly Pro", "Phiên bản app", "Server", "build 22", "không rõ"]) {
    assert.ok(html.includes(s), `thiếu "${s}"`);
  }
  assert.match(html, /<meta name="robots" content="noindex/);
});

import { parseServerStatus } from "../../src/lib/admin/server-status.js";

test("server-status: chỉ nhận số hợp lệ + danh sách chuỗi ngắn (dữ liệu từ ngoài vào)", () => {
  assert.deepEqual(parseServerStatus({ disk_pct: 35, mem_mb: 1800, problems: ["Ổ đĩa 90%"] }),
    { ok: true, value: { disk_pct: 35, mem_mb: 1800, problems: ["Ổ đĩa 90%"] } });
  assert.deepEqual(parseServerStatus({ disk_pct: "35", mem_mb: "1800" }).value, { disk_pct: 35, mem_mb: 1800, problems: [] }, "watchdog gửi chuỗi số cũng nhận");
  for (const bad of [null, "x", { disk_pct: -1, mem_mb: 1 }, { disk_pct: 101, mem_mb: 1 }, { disk_pct: 5, mem_mb: -2 },
    { disk_pct: 5, mem_mb: 1, problems: "x" }, { disk_pct: 5, mem_mb: 1, problems: [1] }, { disk_pct: "5a", mem_mb: 1 }]) {
    assert.equal(parseServerStatus(bad).ok, false, JSON.stringify(bad));
  }
  const many = parseServerStatus({ disk_pct: 1, mem_mb: 1, problems: Array(50).fill("y".repeat(1000)) }).value;
  assert.equal(many.problems.length, 20, "tối đa 20 dòng");
  assert.equal(many.problems[0].length, 300, "mỗi dòng tối đa 300 ký tự");
});

import { buildFromHeader } from "../../src/lib/admin/activity.js";

test("buildFromHeader: X-Wordly-Build hợp lệ → số; thiếu / lạ → null (bản cũ)", () => {
  assert.equal(buildFromHeader("22"), 22);
  assert.equal(buildFromHeader(" 23 "), 23);
  for (const bad of [null, undefined, "", "abc", "22.5", "-1", "0", "9999999"]) assert.equal(buildFromHeader(bad), null, String(bad));
});

import { checkBasicAuth } from "../../src/lib/admin/basic-auth.js";

const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;

test("trang /admin: mật khẩu đúng mới vào, server chưa đặt mật khẩu thì khoá hẳn", () => {
  const pw = "mot-mat-khau-dai-123";
  assert.equal(checkBasicAuth(basic("admin", pw), pw), true);
  assert.equal(checkBasicAuth(basic("bat-ky", pw), pw), true, "tên đăng nhập không quan trọng");
  assert.equal(checkBasicAuth(basic("admin", "sai"), pw), false);
  assert.equal(checkBasicAuth(basic("admin", `${pw}x`), pw), false);
  assert.equal(checkBasicAuth(basic("admin", pw), ""), false, "chưa cấu hình → không ai vào");
  assert.equal(checkBasicAuth(basic("admin", pw), "ngan"), false, "mật khẩu server dưới 12 ký tự → khoá");
  for (const bad of [null, "", "Bearer x", "Basic", "Basic !!!", `Basic ${Buffer.from("khongcohaicham").toString("base64")}`]) {
    assert.equal(checkBasicAuth(bad, pw), false, String(bad));
  }
  assert.equal(checkBasicAuth(basic("a", "pa:ss:word-dai-12"), "pa:ss:word-dai-12"), true, "mật khẩu có dấu hai chấm");
});

test("trang thống kê: khối Hôm nay + tự tải lại khi bật", () => {
  const withToday = { ...STATS, today: { new_users: 1, active: 5, saved: 7, quiz: 2, push_sent: 3, advanced_used: 9, dictionary_used: 4 } };
  const html = renderStatsPage(withToday, { refreshSeconds: 30 });
  assert.match(html, /<meta http-equiv="refresh" content="30">/);
  for (const s of ["Hôm nay (đến giờ)", "Đang dùng hôm nay"]) assert.ok(html.includes(s), `thiếu "${s}"`);
  assert.ok(!renderStatsPage(STATS).includes('http-equiv="refresh"'), "link email: không tự tải lại");
  assert.ok(!renderStatsPage(STATS).includes("Hôm nay (đến giờ)"), "thiếu dữ liệu hôm nay → không hiện khối");
});
