// Dashboard /admin: biểu đồ SVG + khối số liệu (logic thuần, không trình duyệt).
import test from "node:test";
import assert from "node:assert/strict";
import { lineChart, columnChart, funnelChart, mrrVnd } from "../../src/lib/admin/charts.js";
import { renderStatsPage } from "../../src/lib/admin/stats-render.js";

const days = (n, f) => Array.from({ length: n }, (_, i) => ({ label: `${String(i + 1).padStart(2, "0")}/10`, value: f(i) }));

test("lineChart: mỗi điểm có tooltip, không NaN khi toàn 0, nhãn được escape", () => {
  const svg = lineChart(days(30, (i) => i), { title: "Hoạt động" });
  assert.match(svg, /<svg[^>]+role="img"[^>]+aria-label="Hoạt động"/);
  assert.equal((svg.match(/<title>/g) || []).length, 30, "tooltip từng điểm");
  assert.ok(!svg.includes("NaN"));
  const flat = lineChart(days(30, () => 0), { title: "x" });
  assert.ok(!flat.includes("NaN"), "toàn 0 không chia cho 0");
  assert.ok(!lineChart([{ label: "<b>", value: 1 }], { title: "<i>" }).includes("<b>"), "escape nhãn");
});

test("columnChart: cột ≤ 24px, giá trị 0 không vẽ cột, có tooltip", () => {
  const svg = columnChart(days(14, (i) => (i % 2 ? 3 : 0)), { title: "Mới" });
  const widths = [...svg.matchAll(/<path class="col[^"]*"[^>]*data-w="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 7, "chỉ 7 ngày có giá trị");
  assert.ok(widths.every((w) => w <= 24));
  assert.equal((svg.match(/<title>/g) || []).length, 14, "ngày 0 vẫn có tooltip (vùng chạm)");
});

test("funnelChart: tỉ lệ so với bước đầu, thanh tỉ lệ đúng", () => {
  const html = funnelChart([{ label: "Đăng ký", value: 50 }, { label: "Lưu ≥ 1 từ", value: 6 }, { label: "Pro", value: 0 }]);
  assert.ok(html.includes("12%"), "6/50");
  assert.ok(html.includes("width:100%"));
  assert.ok(html.includes("width:12%"));
  assert.ok(!funnelChart([{ label: "a", value: 0 }]).includes("NaN"));
});

test("mrrVnd: năm quy ra tháng + tháng", () => {
  assert.equal(mrrVnd({ yearly: 1, monthly: 2 }), 20750 + 58000);
  assert.equal(mrrVnd(null), 0);
});

const STATS = {
  generated_at: "2026-10-16T05:00:00Z",
  users: { total: 50, new_1d: 2, new_7d: 4, new_30d: 5, dau: 1, wau: 3, mau: 4 },
  retention: { d1: { cohort: 0, returned: 0 }, d7: { cohort: 0, returned: 0 } },
  series: [],
  features: { saved_total: 123, savers: 6, saved_new_1d: 1, quiz_1d: 0, widget_users_7d: 3, push_enabled: 2, push_sent_1d: 3 },
  limits_yesterday: { advanced_translate: 0, dictionary: 0, saved_words: 1 },
  pro: { yearly: 1, monthly: 0, sandbox: 1 },
  builds: [{ build: 22, users: 2 }],
  server: { disk_pct: 35, mem_mb: 1900, problems: [], checked_at: "2026-10-16T04:55:00Z" },
  today: { new_users: 3, active: 2, saved: 2, quiz: 0, push_sent: 0, advanced_used: 0, dictionary_used: 0 },
};
const EXTRA = {
  series30: Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(17 + i).padStart(2, "0")}`.replace(/-09-(3[1-9]|4\d)/, (m, d) => `-10-${String(d - 30).padStart(2, "0")}`), active: i > 27 ? 2 : 0, new_users: i % 5, saved: i % 3, quiz: 0, push_sent: 2, limit_hits: 0 })),
  funnel: { signed_up: 50, saved_1: 6, saved_5: 2, widget_30d: 3, push_enabled: 2, pro_paid: 1 },
  providers: [{ provider: "email", users: 30 }, { provider: "google", users: 15 }, { provider: "apple", users: 5 }],
  quiz: { attempts_7d: 1, avg_percent_7d: 80 },
  push_health: { sent_7d: 18, failed_7d: 0, devices: 1 },
  top_words_7d: [{ word: "resilient", users: 2 }],
  server_history: [{ hour: "2026-10-16T03:00:00Z", disk_pct: 35, mem_mb: 1900, problems: 0 }, { hour: "2026-10-16T04:00:00Z", disk_pct: 36, mem_mb: 1800, problems: 0 }],
};

test("dashboard đầy đủ: các khối mới, không NaN/undefined", () => {
  const html = renderStatsPage({ ...STATS, extra: EXTRA }, { refreshSeconds: 30 });
  for (const s of ["Đang dùng hôm nay", "Phễu kích hoạt", "Doanh thu định kỳ (ước tính)", "20.750 ₫", "Cách đăng ký", "Google", "Apple",
    "Top từ được lưu", "resilient", "Ổ đĩa", "RAM", "Nhắc ôn", "Điểm quiz trung bình", "80%", "30 ngày"]) {
    assert.ok(html.includes(s), `thiếu "${s}"`);
  }
  assert.ok(!/NaN|undefined/.test(html), "không lộ NaN/undefined");
});

test("dashboard thiếu extra (link email cũ) vẫn dựng được", () => {
  const html = renderStatsPage(STATS);
  assert.ok(html.includes("Người dùng"));
  assert.ok(!/NaN|undefined/.test(html));
});
