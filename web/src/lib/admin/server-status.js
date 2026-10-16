// Kiểm dữ liệu watchdog trên VPS gửi lên POST /api/admin/server-status
// (spec 2026-10-16-admin-stats-design.md) — dữ liệu từ ngoài vào, kiểm chặt.
const toInt = (v) => (typeof v === "number" && Number.isInteger(v)) ? v
  : (typeof v === "string" && /^\d+$/.test(v.trim())) ? Number(v.trim()) : NaN;

export function parseServerStatus(body) {
  if (!body || typeof body !== "object") return { ok: false };
  const disk = toInt(body.disk_pct);
  const mem = toInt(body.mem_mb);
  if (!(disk >= 0 && disk <= 100) || !(mem >= 0)) return { ok: false };
  const raw = body.problems ?? [];
  if (!Array.isArray(raw) || raw.some((p) => typeof p !== "string")) return { ok: false };
  return { ok: true, value: { disk_pct: disk, mem_mb: mem, problems: raw.slice(0, 20).map((p) => p.slice(0, 300)) } };
}
