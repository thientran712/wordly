// Test cho rate limit dùng Postgres làm bộ đếm CHUNG.
//
// Vì sao cần bản này: bản trong bộ nhớ (rate-limit.js) KHÔNG hoạt động trên
// Vercel. Đã kiểm chứng trên production: gọi 18 lần, 0 lần bị chặn, vì 6 lần
// gọi liên tiếp được 6 instance khác nhau phục vụ — mỗi instance đếm riêng.
//
// Bản này đếm trong database nên mọi instance dùng chung một bộ đếm.
// Test ở đây kiểm tra phần LOGIC thuần (tính cửa sổ, quyết định chặn);
// phần SQL atomic được test riêng ở tests/rls/ khi có Supabase local.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  windowStartFor,
  decideFromCount,
  buildBucketKey,
} from "../../src/lib/rate-limit-db.js";

describe("windowStartFor — chia thời gian thành khung cố định", () => {
  test("hai thời điểm trong CÙNG khung trả về cùng mốc", () => {
    const w = 60_000;
    // Dùng mốc chia hết cho w làm điểm đầu khung, rồi lấy thời điểm sát cuối
    // khung đó. (Lưu ý: t và t+59_999 KHÔNG nhất thiết cùng khung nếu t nằm
    // giữa khung — đó là bản chất của khung cố định, không phải lỗi.)
    const start = windowStartFor(1_000_000, w);
    assert.equal(windowStartFor(start, w), start);
    assert.equal(windowStartFor(start + 59_999, w), start);
  });

  test("sang khung mới thì mốc thay đổi ĐÚNG một khung", () => {
    const w = 60_000;
    const start = windowStartFor(1_000_000, w);
    assert.equal(windowStartFor(start + 60_000, w), start + w);
    assert.equal(windowStartFor(start + 60_001, w), start + w);
  });

  test("mốc luôn chia hết cho độ dài khung — để mọi instance tính RA CÙNG MỘT mốc", () => {
    // Đây là điểm cốt tử: nếu mỗi instance tính mốc khác nhau thì chúng
    // vẫn đếm riêng, và lỗi cũ lặp lại.
    for (const t of [0, 1, 59_999, 60_000, 123_456_789]) {
      assert.equal(windowStartFor(t, 60_000) % 60_000, 0);
    }
  });

  test("trả về số nguyên (dùng làm khoá DB)", () => {
    assert.ok(Number.isInteger(windowStartFor(1_234_567, 60_000)));
  });
});

describe("decideFromCount — quyết định chặn dựa trên số đếm từ DB", () => {
  const w = 60_000;
  const start = 1_200_000;

  test("dưới giới hạn → cho qua, báo còn bao nhiêu lượt", () => {
    const r = decideFromCount({ count: 1, limit: 5, windowMs: w, windowStart: start, now: start + 1000 });
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, 4);
  });

  test("đúng bằng giới hạn → vẫn cho qua (lượt thứ N)", () => {
    // count là số SAU KHI tăng, nên count=5 với limit=5 là lượt thứ 5 — hợp lệ
    const r = decideFromCount({ count: 5, limit: 5, windowMs: w, windowStart: start, now: start + 1000 });
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, 0);
  });

  test("vượt giới hạn → chặn", () => {
    const r = decideFromCount({ count: 6, limit: 5, windowMs: w, windowStart: start, now: start + 1000 });
    assert.equal(r.allowed, false);
    assert.equal(r.remaining, 0);
  });

  test("khi chặn, retry_after là thời gian còn lại của khung", () => {
    const r = decideFromCount({ count: 99, limit: 5, windowMs: w, windowStart: start, now: start + 10_000 });
    assert.equal(r.allowed, false);
    // Khung dài 60s, đã qua 10s → còn 50s
    assert.ok(r.retry_after_seconds >= 49 && r.retry_after_seconds <= 51,
      `chờ ~50s, nhận ${r.retry_after_seconds}`);
  });

  test("retry_after tối thiểu 1 giây, không bao giờ 0 hoặc âm", () => {
    // Ngay sát cuối khung: làm tròn xuống có thể ra 0 → client thử lại ngay
    // và bị chặn lần nữa, thành vòng lặp vô ích
    const r = decideFromCount({ count: 99, limit: 5, windowMs: w, windowStart: start, now: start + 59_999 });
    assert.ok(r.retry_after_seconds >= 1, `phải >= 1, nhận ${r.retry_after_seconds}`);
  });

  test("đồng hồ lệch (now trước windowStart) không sinh số âm", () => {
    // Instance có đồng hồ lệch nhẹ là chuyện thật trên hệ phân tán
    const r = decideFromCount({ count: 99, limit: 5, windowMs: w, windowStart: start, now: start - 5000 });
    assert.ok(r.retry_after_seconds >= 1 && r.retry_after_seconds <= 60);
  });

  test("khi DB lỗi (count null) → CHO QUA, không chặn oan", () => {
    // Chọn fail-open có chủ đích: database lỗi thì thà cho người dùng thật
    // dùng được còn hơn chặn hết. Rate limit là lớp bảo vệ chi phí, không
    // phải lớp bảo vệ an ninh.
    const r = decideFromCount({ count: null, limit: 5, windowMs: w, windowStart: start, now: start });
    assert.equal(r.allowed, true);
    assert.equal(r.degraded, true, "phải đánh dấu là đang chạy suy giảm");
  });

  test("limit = 0 chặn mọi thứ (dùng để tắt tính năng khẩn cấp)", () => {
    const r = decideFromCount({ count: 1, limit: 0, windowMs: w, windowStart: start, now: start });
    assert.equal(r.allowed, false);
  });
});

describe("buildBucketKey — khoá phải tách được từng người + từng route", () => {
  test("cùng người, route khác → khoá khác", () => {
    const a = buildBucketKey("translate", "ip:1.2.3.4");
    const b = buildBucketKey("dictionary", "ip:1.2.3.4");
    assert.notEqual(a, b, "hai route phải có hạn mức riêng");
  });

  test("cùng route, người khác → khoá khác", () => {
    const a = buildBucketKey("translate", "ip:1.2.3.4");
    const b = buildBucketKey("translate", "ip:5.6.7.8");
    assert.notEqual(a, b);
  });

  test("cùng người + cùng route → khoá GIỐNG (mọi instance phải khớp)", () => {
    assert.equal(
      buildBucketKey("translate", "u:abc"),
      buildBucketKey("translate", "u:abc")
    );
  });

  test("khoá không vượt giới hạn độ dài cột DB", () => {
    const k = buildBucketKey("translate", "ip:" + "9".repeat(500));
    assert.ok(k.length <= 200, `khoá dài ${k.length}, phải <= 200`);
  });

  test("khoá không chứa ký tự lạ gây lỗi khi ghi DB", () => {
    const k = buildBucketKey("translate", "ip:1.2.3.4\n\t; DROP TABLE--");
    assert.match(k, /^[A-Za-z0-9:._-]+$/, `khoá có ký tự lạ: ${k}`);
  });
});
