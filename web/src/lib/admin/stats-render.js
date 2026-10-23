// Dựng email báo cáo sáng + trang thống kê từ kết quả admin_stats()
// (spec 2026-10-16-admin-stats-design.md). Logic thuần để test được.
import { lineChart, columnChart, funnelChart, mrrVnd } from "./charts.js";

export function pct(part, whole) {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const vnTime = (iso, seconds = false) => iso
  ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit",
      ...(seconds ? { second: "2-digit" } : {}), day: "2-digit", month: "2-digit" })
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

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
const vnd = (n) => `${fmt(n)} ₫`;
const dm = (iso) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;
const hourLabel = (iso) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit" });
const PROVIDER = { email: "Email", google: "Google", apple: "Apple" };

const tile = (label, value, note = "", cls = "") => `<div class="tile ${cls}"><div class="tile-label">${esc(label)}</div>
  <div class="tile-value">${esc(value)}</div>${note ? `<div class="tile-note">${esc(note)}</div>` : ""}</div>`;
const panel = (title, inner, { note = "", wide = false } = {}) => `<section class="panel${wide ? " wide" : ""}">
  <header><h2>${esc(title)}</h2>${note ? `<span class="note">${esc(note)}</span>` : ""}</header>${inner}</section>`;
const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;

function serverPanel(server, history) {
  if (!server) return panel("Server", `<p class="muted">Chưa có dữ liệu server (watchdog chưa gửi).</p>`);
  const problems = server.problems || [];
  const status = problems.length
    ? `<div class="status bad"><span class="icon" aria-hidden="true">⚠️</span> ${problems.length} sự cố</div><ul class="problems">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
    : `<div class="status good"><span class="icon" aria-hidden="true">✓</span> Mọi thứ ổn</div>`;
  const charts = history?.length
    ? `<div class="pair"><div class="mini"><h3>Ổ đĩa đã dùng (%) · 7 ngày</h3>${lineChart(history.map((h) => ({ label: hourLabel(h.hour), value: h.disk_pct })), { title: "Ổ đĩa 7 ngày", unit: "%" })}</div>
       <div class="mini"><h3>RAM còn trống (MB) · 7 ngày</h3>${lineChart(history.map((h) => ({ label: hourLabel(h.hour), value: h.mem_mb })), { title: "RAM 7 ngày", unit: "MB", series: "s2" })}</div></div>`
    : "";
  return panel("Server", `${status}${kv([["Ổ đĩa", `${server.disk_pct}%`], ["RAM còn trống", `${fmt(server.mem_mb)} MB`], ["Kiểm lúc", vnTime(server.checked_at)]])}${charts}`,
    { note: "cập nhật 5 phút/lần", wide: true });
}

/** Dashboard /admin (và trang link email). `s.extra` (admin_stats_extra) có thì vẽ đủ biểu đồ. */
export function renderStatsPage(s, { refreshSeconds = 0 } = {}) {
  const u = s.users, f = s.features, l = s.limits_yesterday || {}, x = s.extra || null, t = s.today || null;
  const builds = (s.builds?.length ? s.builds : [{ build: null, users: 0 }]).map((b) => ({ label: b.build ? `build ${b.build}` : "không rõ (bản cũ)", value: b.users }));
  const series = x?.series30 || s.series.map((d) => ({ ...d, saved: 0, quiz: 0, push_sent: 0, limit_hits: 0 }));
  const seriesLabel = x ? "30 ngày" : "14 ngày";

  const hero = t ? `<section class="hero" aria-label="Hôm nay (đến giờ)">
      <div class="hero-main"><div class="tile-label">Đang dùng hôm nay</div><div class="hero-value">${fmt(t.active)}</div>
        <div class="tile-note">Hôm nay (đến giờ) · hôm qua ${fmt(u.dau)}</div></div>
      <div class="hero-tiles">${tile("Người mới hôm nay", fmt(t.new_users))}${tile("Từ lưu mới", fmt(t.saved))}${tile("Quiz", fmt(t.quiz))}
        ${tile("Nhắc ôn đã gửi", fmt(t.push_sent))}${tile("Lượt dịch nâng cao (miễn phí)", fmt(t.advanced_used))}${tile("Lượt tra từ mới (miễn phí)", fmt(t.dictionary_used))}</div>
    </section>` : "";

  const kpis = `<section class="kpis" aria-label="Người dùng">
    ${tile("Tổng tài khoản", fmt(u.total), `+${fmt(u.new_7d)} trong 7 ngày`)}
    ${tile("Hoạt động hôm qua (DAU)", fmt(u.dau))}
    ${tile("Hoạt động 7 ngày (WAU)", fmt(u.wau))}
    ${tile("Hoạt động 30 ngày (MAU)", fmt(u.mau))}
    ${tile("Pro đang trả tiền", fmt(proPaying(s.pro)), `năm ${fmt(s.pro?.yearly)} · tháng ${fmt(s.pro?.monthly)}`)}
    ${tile("Doanh thu định kỳ (ước tính)", vnd(mrrVnd(s.pro)), "mỗi tháng, giá niêm yết")}
  </section>`;

  const panels = [
    serverPanel(s.server, x?.server_history),
    panel(`Người dùng hoạt động · ${seriesLabel}`, lineChart(series.map((d) => ({ label: dm(d.day), value: d.active })), { title: "Người dùng hoạt động", unit: "người", size: "wide" }),
      { note: "ghi từ 16/10", wide: true }),
    panel(`Người đăng ký mới · ${seriesLabel}`, columnChart(series.map((d) => ({ label: dm(d.day), value: d.new_users })), { title: "Người đăng ký mới", unit: "người", series: "s2" })),
    x ? panel("Phễu kích hoạt", funnelChart([
        { label: "Đăng ký", value: x.funnel.signed_up }, { label: "Lưu ≥ 1 từ", value: x.funnel.saved_1 },
        { label: "Lưu ≥ 5 từ", value: x.funnel.saved_5 }, { label: "Dùng widget (30 ngày)", value: x.funnel.widget_30d },
        { label: "Bật nhắc ôn", value: x.funnel.push_enabled }, { label: "Wordly Pro", value: x.funnel.pro_paid }]),
      { note: "% so với số đăng ký" }) : "",
    panel("Giữ chân", `<div class="tiles2">${tile("Quay lại ngày 1", pct(s.retention.d1.returned, s.retention.d1.cohort), `${fmt(s.retention.d1.returned)}/${fmt(s.retention.d1.cohort)} người`)}
      ${tile("Quay lại ngày 7", pct(s.retention.d7.returned, s.retention.d7.cohort), `${fmt(s.retention.d7.returned)}/${fmt(s.retention.d7.cohort)} người`)}</div>
      <p class="muted">Tính trên người đăng ký từ 16/10 (ngày bắt đầu ghi hoạt động).</p>`),
    x ? panel("Cách đăng ký", funnelChart(x.providers.map((p) => ({ label: PROVIDER[p.provider] || p.provider, value: p.users })), { relative: "max" })) : "",
    panel("Tính năng", `${kv([["Từ đã lưu", `${fmt(f.saved_total)} (${fmt(f.savers)} người)`], ["Dùng widget 7 ngày", `${fmt(f.widget_users_7d)} người`],
        ["Bật nhắc ôn", `${fmt(f.push_enabled)} người`], ...(x ? [["Điểm quiz trung bình", x.quiz.attempts_7d ? `${x.quiz.avg_percent_7d}%` : "—"], ["Quiz 7 ngày", fmt(x.quiz.attempts_7d)]] : [])])}
      ${x ? `<div class="mini"><h3>Từ lưu mới · 30 ngày</h3>${columnChart(series.map((d) => ({ label: dm(d.day), value: d.saved })), { title: "Từ lưu mới", unit: "từ" })}</div>` : ""}`),
    panel("Wordly Pro", `${kv([["Pro đang trả tiền", fmt(proPaying(s.pro))], ["Gói năm / gói tháng", `${fmt(s.pro?.yearly)} / ${fmt(s.pro?.monthly)}`],
        ["Doanh thu định kỳ (ước tính)", vnd(mrrVnd(s.pro))], ["Giao dịch thử (TestFlight)", fmt(s.pro?.sandbox)],
        ["Chạm giới hạn dịch hôm qua", fmt(l.advanced_translate)], ["Chạm giới hạn tra từ hôm qua", fmt(l.dictionary)], ["Đã đủ 30 từ (miễn phí)", fmt(l.saved_words)]])}
      ${x ? `<div class="mini"><h3>Người chạm giới hạn · 30 ngày</h3>${columnChart(series.map((d) => ({ label: dm(d.day), value: d.limit_hits })), { title: "Người chạm giới hạn", unit: "người", series: "s2" })}</div>` : ""}`),
    x ? panel("Top từ được lưu · 7 ngày", x.top_words_7d.length
        ? `<ol class="words">${x.top_words_7d.map((w) => `<li><span>${esc(w.word)}</span><span class="muted">${fmt(w.users)} người</span></li>`).join("")}</ol>`
        : `<p class="muted">Chưa có từ nào được từ 2 người trở lên lưu trong 7 ngày.</p>`, { note: "≥ 2 người lưu" }) : "",
    x ? panel("Nhắc ôn", `${kv([["Đã gửi 7 ngày", fmt(x.push_health.sent_7d)], ["Lỗi / bỏ qua 7 ngày", fmt(x.push_health.failed_7d)], ["Thiết bị nhận thông báo", fmt(x.push_health.devices)]])}
      <div class="mini"><h3>Đã gửi · 30 ngày</h3>${columnChart(series.map((d) => ({ label: dm(d.day), value: d.push_sent })), { title: "Nhắc ôn đã gửi", unit: "thông báo" })}</div>`) : "",
    s.ads ? panel("Quảng cáo", kv([["Quảng cáo thưởng hôm nay", fmt(s.ads.rewards_today)], ["Quảng cáo thưởng 7 ngày", fmt(s.ads.rewards_7d)],
        ["Lượt dự phòng hôm nay", fmt(s.ads.fallback_today)], ["Theme đã mở bằng quảng cáo", fmt(s.ads.theme_unlocks_total)],
        ["Lượt thưởng chưa dùng", fmt(s.ads.credits_outstanding)]]), { note: "đã xác thực SSV" }) : "",
    panel("Phiên bản app (7 ngày)", funnelChart(builds, { relative: "max" }), { wide: true }),
  ].filter(Boolean).join("");

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">${refreshSeconds ? `<meta http-equiv="refresh" content="${Number(refreshSeconds)}">` : ""}
<title>Wordly Dashboard</title><style>
:root{color-scheme:light;--page:#f4f6f5;--card:#fff;--ink:#1f2a2e;--soft:#5e6a6e;--muted:#8c979a;--line:#e3e8e6;--grid:#e9eeec;--base:#c8d0cd;
 --brand:#58cc02;--s1:#2a78d6;--s2:#eb6834;--good:#0ca30c;--bad:#d03b3b;--shadow:0 1px 2px rgba(16,24,40,.05)}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--page:#131f24;--card:#1f2e36;--ink:#f1f5f4;--soft:#b8c3c6;--muted:#7f8d91;--line:#2c3d45;--grid:#2a3a42;--base:#3a4c55;
 --s1:#3987e5;--s2:#d95926;--shadow:none}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:20px 16px 40px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.brand{display:flex;align-items:center;gap:10px}.logo{width:32px;height:32px;border-radius:9px;background:var(--brand);display:grid;place-items:center;color:#fff;font-weight:800}
h1{font-size:20px;margin:0}.sub{color:var(--soft);font-size:13px}.live{display:inline-flex;align-items:center;gap:6px;color:var(--soft);font-size:13px}
.live i{width:8px;height:8px;border-radius:50%;background:var(--good);box-shadow:0 0 0 3px color-mix(in srgb,var(--good) 25%,transparent)}
.hero{display:grid;grid-template-columns:minmax(220px,1fr) 3fr;gap:12px;margin-bottom:12px}
.hero-main,.tile,.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
.hero-main{padding:18px 20px}.hero-value{font-size:56px;font-weight:700;line-height:1.05;margin:6px 0}
.hero-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:12px}
.tile{padding:14px 16px}.tile-label{color:var(--soft);font-size:12.5px}.tile-value{font-size:24px;font-weight:650;margin-top:4px}.tile-note{color:var(--muted);font-size:12px;margin-top:2px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.panel{padding:14px 16px 16px;min-width:0}.panel.wide{grid-column:1/-1}
.panel header{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:10px}h2{font-size:14.5px;margin:0}h3{font-size:12.5px;color:var(--soft);font-weight:500;margin:14px 0 4px}
.note,.muted{color:var(--muted);font-size:12px}.tiles2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tiles2 .tile{box-shadow:none}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin:0}.kv div{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid var(--grid);padding:5px 0}
.kv dt{color:var(--soft)}.kv dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums;text-align:right}
.chart{width:100%;height:auto;display:block;overflow:visible}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.chart .grid{stroke:var(--grid);stroke-width:1}.chart .base{stroke:var(--base);stroke-width:1}
.chart .tick{fill:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}.chart .end{fill:var(--ink);font-size:12px;font-weight:600}
.chart .line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.chart .area{opacity:.1;stroke:none}.chart .dot{stroke:var(--card);stroke-width:2}.chart .hit{fill:transparent}.chart .hit:hover{fill:color-mix(in srgb,var(--ink) 6%,transparent)}
.line.s1{stroke:var(--s1)}.area.s1,.dot.s1,.col.s1{fill:var(--s1)}.line.s2{stroke:var(--s2)}.area.s2,.dot.s2,.col.s2{fill:var(--s2)}
.bars{display:grid;gap:8px}.bar-row{display:grid;grid-template-columns:150px 1fr auto;align-items:center;gap:10px}.bar-label{color:var(--soft);font-size:13px}
.bar-track{height:10px;border-radius:5px;background:color-mix(in srgb,var(--s1) 14%,transparent);overflow:hidden}.bar-fill{display:block;height:100%;border-radius:5px;background:var(--s1);min-width:2px}
.bar-value{font-weight:600;font-variant-numeric:tabular-nums;font-size:13px}
.status{display:inline-flex;align-items:center;gap:6px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:10px}
.status.good{color:var(--good);background:color-mix(in srgb,var(--good) 12%,transparent)}.status.bad{color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,transparent)}
.problems{margin:0 0 10px;padding-left:18px;color:var(--bad)}.words{margin:0;padding-left:20px}.words li{padding:4px 0;border-bottom:1px solid var(--grid)}.words li{display:list-item}
.words li span:first-child{font-weight:600;margin-right:8px}.mini+.mini{margin-top:4px}
@media (max-width:900px){.pair{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(3,1fr)}.hero{grid-template-columns:1fr}.grid{grid-template-columns:1fr}}
@media (max-width:560px){.kpis,.hero-tiles{grid-template-columns:repeat(2,1fr)}.kv{grid-template-columns:1fr}.bar-row{grid-template-columns:110px 1fr auto}.hero-value{font-size:48px}}
</style></head><body><div class="wrap">
<div class="top"><div class="brand"><div class="logo">W</div><div><h1>Wordly Dashboard</h1>
  <div class="sub">Cập nhật ${esc(vnTime(s.generated_at, true))} (giờ Việt Nam)${refreshSeconds ? ` · tự tải lại mỗi ${Number(refreshSeconds)} giây` : ""}</div></div></div>
  ${refreshSeconds ? `<span class="live"><i></i>Trực tiếp</span>` : ""}</div>
${hero}${kpis}<div class="grid">${panels}</div>
</div></body></html>`;
}
