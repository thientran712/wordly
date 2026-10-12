import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllRows } from "../../src/lib/supabase/fetch-all-rows.js";
import { findDueSlots } from "../../src/lib/email/due-slots.js";

const MAX_ROWS = 1000; // PostgREST db-max-rows trên production (PGRST_DB_MAX_ROWS)

// Supabase giả mô phỏng PostgREST: mỗi request trả tối đa MAX_ROWS dòng,
// .range(from, to) cắt theo thứ tự .order().
function fakeSupabase(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      let from = 0;
      let to = Infinity;
      const q = {
        select: () => q,
        eq(col, val) { rows = rows.filter(r => r[col] === val); return q; },
        gte: () => q,
        limit: () => q,
        order(col) { rows.sort((a, b) => String(a[col]).localeCompare(String(b[col]))); return q; },
        range(a, b) { from = a; to = b; return q; },
        then(resolve) {
          const end = Math.min(to + 1, from + MAX_ROWS);
          return Promise.resolve({ data: rows.slice(from, end), error: null }).then(resolve);
        },
      };
      return q;
    },
  };
}

const uid = (i) => `u${String(i).padStart(5, "0")}`;

test("fetchAllRows lấy đủ mọi trang khi bảng vượt giới hạn 1000 dòng", async () => {
  const items = Array.from({ length: 2500 }, (_, i) => ({ id: uid(i) }));
  const supabase = fakeSupabase({ items });
  const rows = await fetchAllRows(() => supabase.from("items").select("id"));
  assert.equal(rows.length, 2500);
  assert.equal(new Set(rows.map(r => r.id)).size, 2500);
});

test("fetchAllRows ném lỗi khi một trang lỗi (không lặng lẽ trả thiếu)", async () => {
  const broken = { order: () => broken, range: () => broken, then: (r) => Promise.resolve({ data: null, error: { message: "boom" } }).then(r) };
  await assert.rejects(() => fetchAllRows(() => broken), /boom/);
});

test("cron email xét cả người dùng thứ 1.001 trở đi", async () => {
  const N = 2500;
  const late = 2001; // nằm ngoài 1000 dòng đầu ở cả 3 bảng
  // 01:00Z = 10:00 Tokyo. Chỉ người dùng `late` hẹn 10:00 giờ Tokyo; nếu không
  // đọc được timezone của họ thì rơi về giờ VN (08:00) → không tới giờ.
  const now = new Date("2026-10-12T01:00:00Z");
  const supabase = fakeSupabase({
    email_preferences: Array.from({ length: N }, (_, i) => ({ user_id: uid(i), enabled: true, frequency: "daily", custom_days: null })),
    profiles: Array.from({ length: N }, (_, i) => ({ id: uid(i), timezone: i === late ? "Asia/Tokyo" : "Asia/Ho_Chi_Minh" })),
    email_slots: Array.from({ length: N }, (_, i) => ({ id: `s${String(i).padStart(5, "0")}`, user_id: uid(i), enabled: true, send_time: i === late ? "10:00:00" : "20:00:00" })),
  });

  const { checked, dueSlots } = await findDueSlots(supabase, now, 5);
  assert.equal(checked, N);
  assert.deepEqual(dueSlots.map(s => s.id), [`s0${late}`]);
});
