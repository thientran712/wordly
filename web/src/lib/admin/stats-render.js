// Dựng email báo cáo sáng + trang thống kê từ kết quả admin_stats()
// (spec 2026-10-16-admin-stats-design.md). Logic thuần để test được.

export function pct(part, whole) {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const vnTime = (iso) => iso
  ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
  : "—";

const proPaying = (pro) => (pro?.yearly || 0) + (pro?.monthly || 0);

function serverLines(server) {
  if (!server) return ["Chưa có dữ liệu server (watchdog chưa gửi)."];
  const head = `Ổ đĩa ${server.disk_pct}% · RAM còn ${server.mem_mb} MB · kiểm lúc ${vnTime(server.checked_at)}`;
  const problems = server.problems || [];
  return problems.length ? [head, ...problems.map((p) => `⚠️ ${p}`)] : [head, "Không có sự cố."];
}

/** Email 8:00 sáng — số của hôm qua + link trang chi tiết. */
export function renderDailyReport(s, { link }) {
  const u = s.users, f = s.features, l = s.limits_yesterday || {};
  const hasProblem = (s.server?.problems || []).length > 0;
  const subject = `${hasProblem ? "⚠️ " : ""}Wordly hôm qua: ${u.new_1d} người mới · ${u.dau} người dùng · ${proPaying(s.pro)} Pro`;
  const lines = [
    "NGƯỜI DÙNG",
    `Tổng tài khoản: ${u.total}`,
    `Mới: ${u.new_1d} hôm qua · ${u.new_7d} trong 7 ngày · ${u.new_30d} trong 30 ngày`,
    `Hoạt động: ${u.dau} hôm qua · ${u.wau} trong 7 ngày · ${u.mau} trong 30 ngày`,
    `Quay lại ngày 1: ${pct(s.retention.d1.returned, s.retention.d1.cohort)} (${s.retention.d1.returned}/${s.retention.d1.cohort})`,
    `Quay lại ngày 7: ${pct(s.retention.d7.returned, s.retention.d7.cohort)} (${s.retention.d7.returned}/${s.retention.d7.cohort})`,
    "",
    "TÍNH NĂNG",
    `Từ đã lưu: ${f.saved_total} (${f.savers} người) · lưu mới hôm qua ${f.saved_new_1d}`,
    `Quiz hôm qua: ${f.quiz_1d} · Dùng widget 7 ngày: ${f.widget_users_7d} người`,
    `Bật nhắc ôn: ${f.push_enabled} người · đã gửi hôm qua ${f.push_sent_1d}`,
    "",
    "WORDLY PRO",
    `Pro đang trả tiền: ${proPaying(s.pro)} (năm ${s.pro?.yearly || 0} · tháng ${s.pro?.monthly || 0})`,
    `Chạm giới hạn hôm qua: dịch nâng cao ${l.advanced_translate || 0} · tra từ ${l.dictionary || 0} · đủ 30 từ ${l.saved_words || 0}`,
    "",
    "SERVER",
    ...serverLines(s.server),
    "",
    `Xem chi tiết (link có hạn 7 ngày): ${link}`,
  ];
  const text = lines.join("\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#2b2b2b">${
    lines.map((x) => (x === "" ? "<br>" : /^[A-ZĐ ]+$/.test(x) && x.length < 20 ? `<b style="color:#58a700">${esc(x)}</b><br>` : `${esc(x)}<br>`)).join("")
      .replace(esc(link), `<a href="${esc(link)}">Mở trang thống kê</a>`)
  }</div>`;
  return { subject, text, html };
}

const card = (title, rows) => `<section><h2>${esc(title)}</h2><table>${
  rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")
}</table></section>`;

/** Trang /api/admin/stats — HTML tĩnh, không script, không tải gì bên ngoài. */
export function renderStatsPage(s) {
  const u = s.users, f = s.features, l = s.limits_yesterday || {};
  const maxActive = Math.max(1, ...s.series.map((d) => Math.max(d.active, d.new_users)));
  const bars = s.series.map((d) => `<tr><td>${esc(d.day.slice(8, 10))}/${esc(d.day.slice(5, 7))}</td>
    <td><span class="bar a" style="width:${(d.active / maxActive) * 100}%"></span> ${d.active}</td>
    <td><span class="bar n" style="width:${(d.new_users / maxActive) * 100}%"></span> ${d.new_users}</td></tr>`).join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Thống kê Wordly</title><style>
:root{--bg:#fff;--ink:#2b2b2b;--soft:#5e5e5e;--line:#e5e5e5;--green:#58cc02;--blue:#1cb0f6}
@media (prefers-color-scheme:dark){:root{--bg:#131f24;--ink:#fff;--soft:#afafaf;--line:#2a3a42}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,Segoe UI,sans-serif;padding:16px;max-width:720px;margin:auto}
h1{font-size:22px;margin:8px 0 2px}p.sub{color:var(--soft);margin:0 0 16px}
section{border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin:12px 0}
h2{font-size:15px;margin:0 0 6px;color:var(--green)}table{width:100%;border-collapse:collapse}
td{padding:4px 0;border-bottom:1px solid var(--line)}td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.chart td:nth-child(2),.chart td:nth-child(3){width:40%;text-align:left}
.bar{display:inline-block;height:10px;border-radius:5px;vertical-align:middle;min-width:2px}.a{background:var(--green)}.n{background:var(--blue)}
</style></head><body>
<h1>Thống kê Wordly</h1><p class="sub">Cập nhật ${esc(vnTime(s.generated_at))} (giờ Việt Nam)</p>
${card("Người dùng", [["Tổng tài khoản", u.total], ["Mới hôm qua / 7 ngày / 30 ngày", `${u.new_1d} / ${u.new_7d} / ${u.new_30d}`],
    ["Hoạt động hôm qua (DAU)", u.dau], ["Hoạt động 7 ngày (WAU)", u.wau], ["Hoạt động 30 ngày (MAU)", u.mau]])}
<section><h2>14 ngày gần nhất</h2><table class="chart"><tr><td>Ngày</td><td>Hoạt động</td><td>Mới</td></tr>${bars}</table></section>
${card("Giữ chân", [["Quay lại ngày 1", `${pct(s.retention.d1.returned, s.retention.d1.cohort)} (${s.retention.d1.returned}/${s.retention.d1.cohort})`],
    ["Quay lại ngày 7", `${pct(s.retention.d7.returned, s.retention.d7.cohort)} (${s.retention.d7.returned}/${s.retention.d7.cohort})`]])}
${card("Tính năng", [["Từ đã lưu", `${f.saved_total} (${f.savers} người)`], ["Lưu mới hôm qua", f.saved_new_1d], ["Quiz hôm qua", f.quiz_1d],
    ["Dùng widget 7 ngày", `${f.widget_users_7d} người`], ["Bật nhắc ôn", `${f.push_enabled} người`], ["Nhắc ôn đã gửi hôm qua", f.push_sent_1d]])}
${card("Wordly Pro", [["Pro đang trả tiền", proPaying(s.pro)], ["Gói năm / gói tháng", `${s.pro?.yearly || 0} / ${s.pro?.monthly || 0}`],
    ["Giao dịch thử (Sandbox/TestFlight)", s.pro?.sandbox || 0], ["Chạm giới hạn dịch nâng cao hôm qua", l.advanced_translate || 0],
    ["Chạm giới hạn tra từ hôm qua", l.dictionary || 0], ["Đã đủ 30 từ (bản miễn phí)", l.saved_words || 0]])}
${card("Phiên bản app (7 ngày)", (s.builds.length ? s.builds : [{ build: null, users: 0 }]).map((b) => [b.build ? `build ${b.build}` : "không rõ (bản cũ)", `${b.users} người`]))}
${card("Server", serverLines(s.server).map((x) => [x, ""]))}
</body></html>`;
}
