// Test cho rate limit.
//
// Vì sao cần: /api/translate và /api/dictionary đang CÔNG KHAI, không giới
// hạn. Ai cũng gọi được → đốt quota DeepL/Groq của chủ dự án. Đây là nợ kỹ
// thuật 🔴 trong PROGRESS.md.
//
// Logic phải đúng ở ca biên: cửa sổ thời gian trượt, nhiều IP độc lập,
// và không được chặn oan người dùng thật.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createRateLimiter,
  clientKeyFromRequest,
} from "../../src/lib/rate-limit.js";

describe("createRateLimiter", () => {
  let limiter;
  let now;

  beforeEach(() => {
    now = 1_000_000;
    // Tiêm đồng hồ để test được cửa sổ thời gian mà không phải chờ thật
    limiter = createRateLimiter({ limit: 3, windowMs: 60_000, clock: () => now });
  });

  test("cho qua khi chưa đạt giới hạn", () => {
    for (let i = 1; i <= 3; i++) {
      const r = limiter.check("ip-1");
      assert.equal(r.allowed, true, `lần ${i} phải được qua`);
      assert.equal(r.remaining, 3 - i);
    }
  });

  test("chặn khi vượt giới hạn", () => {
    limiter.check("ip-1");
    limiter.check("ip-1");
    limiter.check("ip-1");
    const r = limiter.check("ip-1");
    assert.equal(r.allowed, false);
    assert.equal(r.remaining, 0);
    assert.ok(r.retry_after_seconds > 0, "phải cho biết chờ bao lâu");
  });

  test("các IP khác nhau đếm ĐỘC LẬP", () => {
    limiter.check("ip-1");
    limiter.check("ip-1");
    limiter.check("ip-1");
    assert.equal(limiter.check("ip-1").allowed, false, "ip-1 đã hết lượt");
    assert.equal(limiter.check("ip-2").allowed, true, "ip-2 không bị ảnh hưởng");
  });

  test("hết cửa sổ thời gian thì được gọi lại", () => {
    limiter.check("ip-1");
    limiter.check("ip-1");
    limiter.check("ip-1");
    assert.equal(limiter.check("ip-1").allowed, false);

    now += 60_001; // qua cửa sổ 60 giây
    assert.equal(limiter.check("ip-1").allowed, true, "phải được gọi lại");
  });

  test("cửa sổ TRƯỢT, không phải reset theo mốc cố định", () => {
    // Gọi 3 lần rải rác trong cửa sổ
    limiter.check("ip-1");           // t=0
    now += 30_000; limiter.check("ip-1"); // t=30s
    now += 20_000; limiter.check("ip-1"); // t=50s
    assert.equal(limiter.check("ip-1").allowed, false, "đã 3 lần trong 60s");

    // Tại t=61s, lần gọi ở t=0 đã ra khỏi cửa sổ → còn 2 lần → được qua
    now += 11_000;
    assert.equal(limiter.check("ip-1").allowed, true, "cửa sổ trượt phải giải phóng lượt cũ");
  });

  test("retry_after phản ánh thời điểm lượt cũ nhất hết hạn", () => {
    limiter.check("ip-1");
    now += 10_000;
    limiter.check("ip-1");
    limiter.check("ip-1");
    const r = limiter.check("ip-1");
    assert.equal(r.allowed, false);
    // Lượt cũ nhất ở t=0, hết hạn ở t=60s; hiện t=10s → chờ ~50s
    assert.ok(r.retry_after_seconds >= 49 && r.retry_after_seconds <= 51,
      `chờ ~50s, nhận ${r.retry_after_seconds}`);
  });

  test("key rỗng vẫn xử lý được, không sập", () => {
    assert.equal(limiter.check("").allowed, true);
    assert.equal(limiter.check(null).allowed, true);
  });

  test("dọn bộ nhớ: key không dùng nữa bị loại", () => {
    limiter.check("ip-cũ");
    now += 120_000; // quá 2 cửa sổ
    limiter.check("ip-mới");
    assert.ok(limiter.size() <= 2, `bộ nhớ phải được dọn, hiện ${limiter.size()} key`);
  });

  test("giới hạn số key để không phình bộ nhớ vô hạn", () => {
    const small = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 10, clock: () => now });
    for (let i = 0; i < 50; i++) small.check(`ip-${i}`);
    assert.ok(small.size() <= 10, `tối đa 10 key, hiện ${small.size()}`);
  });
});

describe("clientKeyFromRequest", () => {
  const mk = (headers) => ({ headers: new Map(Object.entries(headers)) });

  test("ưu tiên user id khi đã đăng nhập", () => {
    const k = clientKeyFromRequest(mk({ "x-forwarded-for": "1.2.3.4" }), "user-abc");
    assert.equal(k, "u:user-abc");
  });

  test("dùng IP khi là khách", () => {
    const k = clientKeyFromRequest(mk({ "x-forwarded-for": "1.2.3.4" }), null);
    assert.equal(k, "ip:1.2.3.4");
  });

  test("lấy IP ĐẦU TIÊN trong x-forwarded-for", () => {
    // Chuỗi proxy: client, proxy1, proxy2 — client là cái đầu
    const k = clientKeyFromRequest(mk({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.9.9.9" }), null);
    assert.equal(k, "ip:1.2.3.4");
  });

  test("fallback x-real-ip", () => {
    const k = clientKeyFromRequest(mk({ "x-real-ip": "7.7.7.7" }), null);
    assert.equal(k, "ip:7.7.7.7");
  });

  test("không có IP nào → key chung", () => {
    const k = clientKeyFromRequest(mk({}), null);
    assert.equal(k, "ip:unknown");
  });
});
