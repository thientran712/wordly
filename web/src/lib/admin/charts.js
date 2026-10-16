// Biểu đồ SVG thuần cho dashboard /admin — không thư viện, không script.
// Theo quy ước dataviz: đường 2px, vùng phủ ~10%, cột ≤ 24px bo 4px ở đầu dữ liệu,
// lưới mảnh, nhãn chọn lọc (giá trị cuối), tooltip <title> ở mọi điểm (vùng chạm rộng).
// Màu lấy từ CSS (--s1, --s2…) để sáng/tối đổi một chỗ.

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

// Kích thước theo ô chứa (giữ tỉ lệ khi co giãn → chữ trục không bị kéo méo)
const SIZES = { half: [520, 190], wide: [1120, 220] };
const PAD_L = 34, PAD_R = 40, PAD_T = 16, PAD_B = 26;

/** Mốc trục Y tròn: 0 · giữa · đỉnh (đỉnh làm tròn lên cho đẹp). */
function niceMax(max) {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= max / 4) * pow;
  return Math.ceil(max / step) * step;
}

function frame(points, title, unit, size = "half") {
  const [W, H] = SIZES[size] || SIZES.half;
  const max = niceMax(Math.max(0, ...points.map((p) => Number(p.value) || 0)));
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const n = Math.max(points.length, 1);
  const slot = innerW / n;
  const x = (i) => PAD_L + slot * i + slot / 2;
  const y = (v) => PAD_T + innerH - ((Number(v) || 0) / max) * innerH;
  const ticks = [0, max / 2, max].map((t) => `<line class="grid" x1="${PAD_L}" x2="${W - PAD_R}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="tick" x="${PAD_L - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(Math.round(t))}</text>`).join("");
  // Nhãn trục X: đầu · giữa · cuối (không dồn chữ)
  const xi = [...new Set([0, Math.floor((n - 1) / 2), n - 1])].filter((i) => points[i]);
  const xLabels = xi.map((i) => `<text class="tick" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(points[i].label)}</text>`).join("");
  const tip = (p) => `<title>${esc(p.label)}: ${fmt(p.value)}${unit ? ` ${esc(unit)}` : ""}</title>`;
  const open = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  return { max, x, y, slot, ticks, xLabels, tip, open, baseY: y(0), W, H };
}

export function lineChart(points, { title, unit = "", series = "s1", size = "half" } = {}) {
  const f = frame(points, title, unit, size);
  if (!points.length) return `${f.open}${f.ticks}</svg>`;
  const pts = points.map((p, i) => `${f.x(i).toFixed(1)},${f.y(p.value).toFixed(1)}`);
  const area = `M${f.x(0).toFixed(1)},${f.baseY} L${pts.join(" L")} L${f.x(points.length - 1).toFixed(1)},${f.baseY} Z`;
  const last = points[points.length - 1];
  const lx = f.x(points.length - 1), ly = f.y(last.value);
  const hits = points.map((p, i) => `<rect class="hit" x="${(f.x(i) - f.slot / 2).toFixed(1)}" y="${PAD_T}" width="${f.slot.toFixed(1)}" height="${f.H - PAD_T - PAD_B}">${f.tip(p)}</rect>`).join("");
  return `${f.open}${f.ticks}
    <path class="area ${series}" d="${area}"/>
    <polyline class="line ${series}" points="${pts.join(" ")}"/>
    <circle class="dot ${series}" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4"/>
    <text class="end" x="${(lx + 8).toFixed(1)}" y="${(ly + 4).toFixed(1)}">${fmt(last.value)}</text>
    ${f.xLabels}${hits}</svg>`;
}

export function columnChart(points, { title, unit = "", series = "s1", size = "half" } = {}) {
  const f = frame(points, title, unit, size);
  const w = Math.min(24, f.slot * 0.6);
  const r = Math.min(4, w / 2);
  const cols = points.map((p, i) => {
    const v = Number(p.value) || 0;
    if (v <= 0) return "";
    const x0 = f.x(i) - w / 2, top = f.y(v), h = f.baseY - top;
    const rr = Math.min(r, h);
    // Đầu dữ liệu bo 4px, chân cột vuông trên đường gốc
    return `<path class="col ${series}" data-w="${w.toFixed(1)}" d="M${x0.toFixed(1)},${f.baseY} V${(top + rr).toFixed(1)} Q${x0.toFixed(1)},${top.toFixed(1)} ${(x0 + rr).toFixed(1)},${top.toFixed(1)} H${(x0 + w - rr).toFixed(1)} Q${(x0 + w).toFixed(1)},${top.toFixed(1)} ${(x0 + w).toFixed(1)},${(top + rr).toFixed(1)} V${f.baseY} Z"/>`;
  }).join("");
  const hits = points.map((p, i) => `<rect class="hit" x="${(f.x(i) - f.slot / 2).toFixed(1)}" y="${PAD_T}" width="${f.slot.toFixed(1)}" height="${f.H - PAD_T - PAD_B}">${f.tip(p)}</rect>`).join("");
  return `${f.open}${f.ticks}<line class="base" x1="${PAD_L}" x2="${f.W - PAD_R}" y1="${f.baseY}" y2="${f.baseY}"/>${cols}${f.xLabels}${hits}</svg>`;
}

/** Thanh ngang (phễu, phân bố): HTML để chữ không bị co giãn theo SVG. */
export function funnelChart(rows, { relative = "first" } = {}) {
  const base = relative === "first" ? (Number(rows[0]?.value) || 0) : Math.max(0, ...rows.map((r) => Number(r.value) || 0));
  return `<div class="bars">${rows.map((r) => {
    const v = Number(r.value) || 0;
    const p = base ? Math.round((v / base) * 100) : 0;
    return `<div class="bar-row" title="${esc(r.label)}: ${fmt(v)}">
      <div class="bar-label">${esc(r.label)}</div>
      <div class="bar-track"><span class="bar-fill" style="width:${p}%"></span></div>
      <div class="bar-value">${fmt(v)}<span class="muted"> · ${p}%</span></div></div>`;
  }).join("")}</div>`;
}

/** Doanh thu định kỳ hằng tháng ước tính (giá niêm yết, chưa trừ phí Apple/thuế). */
export function mrrVnd(pro) {
  return Math.round((pro?.yearly || 0) * 249_000 / 12 + (pro?.monthly || 0) * 29_000);
}
