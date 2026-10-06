// Test cho tích hợp thanh toán VNPay.
//
// Vì sao cần test kỹ: đây là nghiệp vụ TIỀN THẬT. Ký sai chữ ký làm giao
// dịch bị từ chối; XÁC MINH SAI chữ ký callback là lỗ hổng cho phép giả
// mạo "đã thanh toán" mà không trả tiền — nghiêm trọng nhất trong toàn hệ
// thống. Test theo đúng thuật toán VNPay công bố (HMAC-SHA512, sắp xếp
// tham số theo alphabet, encode theo chuẩn VNPay).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildPaymentUrl,
  verifyReturnSignature,
  verifyIpnSignature,
  formatVnpAmount,
  formatVnpDate,
  vndFromVnpAmount,
} from "../../src/lib/vnpay.js";

const CONFIG = {
  tmnCode: "DEMO_TMN",
  hashSecret: "DEMO_SECRET_KEY_12345",
  paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
};

describe("formatVnpAmount / vndFromVnpAmount", () => {
  test("VNPay yêu cầu nhân 100 (không có phần thập phân trong VND)", () => {
    assert.equal(formatVnpAmount(50000), "5000000");
  });

  test("chuyển ngược lại đúng giá trị gốc", () => {
    assert.equal(vndFromVnpAmount("5000000"), 50000);
  });

  test("từ chối số tiền không hợp lệ", () => {
    assert.throws(() => formatVnpAmount(0));
    assert.throws(() => formatVnpAmount(-1000));
    assert.throws(() => formatVnpAmount(1.5));
    assert.throws(() => formatVnpAmount(NaN));
  });
});

describe("formatVnpDate", () => {
  test("định dạng yyyyMMddHHmmss theo giờ Việt Nam", () => {
    // 2026-09-06 10:30:00 UTC = 17:30:00 giờ VN (UTC+7)
    const d = new Date("2026-09-06T10:30:00.000Z");
    assert.equal(formatVnpDate(d), "20260906173000");
  });
});

describe("buildPaymentUrl", () => {
  test("tạo URL có đầy đủ tham số bắt buộc", () => {
    const url = buildPaymentUrl(CONFIG, {
      amount: 500000,
      orderId: "TUITION-abc123-1",
      orderInfo: "Thanh toan hoc phi",
      ipAddr: "127.0.0.1",
      returnUrl: "https://wordly.app/api/payments/vnpay/return",
    });

    const u = new URL(url);
    assert.equal(u.origin + u.pathname, CONFIG.paymentUrl);
    assert.equal(u.searchParams.get("vnp_TmnCode"), "DEMO_TMN");
    assert.equal(u.searchParams.get("vnp_Amount"), "50000000");
    assert.equal(u.searchParams.get("vnp_TxnRef"), "TUITION-abc123-1");
    assert.equal(u.searchParams.get("vnp_CurrCode"), "VND");
    assert.equal(u.searchParams.get("vnp_Version"), "2.1.0");
    assert.ok(u.searchParams.get("vnp_SecureHash"), "phải có chữ ký");
  });

  test("chữ ký thay đổi khi amount thay đổi (không phải hằng số cố định)", () => {
    const a = buildPaymentUrl(CONFIG, {
      amount: 100000, orderId: "T1", orderInfo: "x", ipAddr: "1.1.1.1",
      returnUrl: "https://x.com/r",
    });
    const b = buildPaymentUrl(CONFIG, {
      amount: 200000, orderId: "T1", orderInfo: "x", ipAddr: "1.1.1.1",
      returnUrl: "https://x.com/r",
    });
    const hashA = new URL(a).searchParams.get("vnp_SecureHash");
    const hashB = new URL(b).searchParams.get("vnp_SecureHash");
    assert.notEqual(hashA, hashB, "đổi số tiền mà chữ ký không đổi là lỗ hổng nghiêm trọng");
  });

  test("orderId (vnp_TxnRef) phải duy nhất — không tự sinh trùng", () => {
    // Hàm không tự sinh orderId, nhận từ caller — test này xác nhận nó
    // truyền thẳng không sửa đổi
    const url = buildPaymentUrl(CONFIG, {
      amount: 100000, orderId: "UNIQUE-REF-999", orderInfo: "x",
      ipAddr: "1.1.1.1", returnUrl: "https://x.com/r",
    });
    assert.equal(new URL(url).searchParams.get("vnp_TxnRef"), "UNIQUE-REF-999");
  });

  test("từ chối amount không hợp lệ ngay khi build URL", () => {
    assert.throws(() => buildPaymentUrl(CONFIG, {
      amount: -1, orderId: "T1", orderInfo: "x", ipAddr: "1.1.1.1", returnUrl: "https://x.com/r",
    }));
  });

  test("orderInfo có ký tự đặc biệt vẫn tạo được URL hợp lệ", () => {
    const url = buildPaymentUrl(CONFIG, {
      amount: 100000, orderId: "T1", orderInfo: "Học phí & phí khác (đợt 2)",
      ipAddr: "1.1.1.1", returnUrl: "https://x.com/r",
    });
    assert.doesNotThrow(() => new URL(url));
  });
});

describe("verifyReturnSignature — CỔNG BẢO MẬT QUAN TRỌNG NHẤT", () => {
  // Tạo bộ tham số callback giả lập đúng cách VNPay tạo chữ ký thật, để
  // test không phụ thuộc vào việc gọi buildPaymentUrl trước.
  function makeSignedParams(params, hashSecret) {
    const sorted = Object.keys(params).sort();
    const signData = sorted.map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, "+")}`).join("&");
    const hmac = crypto.createHmac("sha512", hashSecret).update(signData).digest("hex");
    return { ...params, vnp_SecureHash: hmac };
  }

  test("chữ ký ĐÚNG được xác nhận hợp lệ", () => {
    const params = makeSignedParams({
      vnp_Amount: "50000000",
      vnp_TxnRef: "ORDER1",
      vnp_ResponseCode: "00",
      vnp_TransactionStatus: "00",
    }, CONFIG.hashSecret);

    assert.equal(verifyReturnSignature(CONFIG, params), true);
  });

  test("chữ ký SAI (giả mạo) bị từ chối — đây là ca quan trọng nhất", () => {
    const params = makeSignedParams({
      vnp_Amount: "50000000",
      vnp_TxnRef: "ORDER1",
      vnp_ResponseCode: "00",
    }, "SAI_SECRET_KHONG_PHAI_CUA_VNPAY");

    assert.equal(verifyReturnSignature(CONFIG, params), false);
  });

  test("kẻ tấn công sửa amount SAU KHI có chữ ký hợp lệ → phải bị phát hiện", () => {
    // Đây là kịch bản tấn công thật: chặn response, đổi amount thành số
    // nhỏ hơn hoặc đổi ResponseCode thành 00 (thành công) rồi gửi lại
    const params = makeSignedParams({
      vnp_Amount: "50000000",
      vnp_TxnRef: "ORDER1",
      vnp_ResponseCode: "00",
    }, CONFIG.hashSecret);

    params.vnp_Amount = "1"; // đổi thành 1 đồng sau khi ký
    assert.equal(verifyReturnSignature(CONFIG, params), false, "sửa amount sau ký PHẢI bị phát hiện");
  });

  test("kẻ tấn công đổi ResponseCode từ thất bại thành thành công → phải bị phát hiện", () => {
    const params = makeSignedParams({
      vnp_Amount: "50000000",
      vnp_TxnRef: "ORDER1",
      vnp_ResponseCode: "24", // khách huỷ giao dịch
    }, CONFIG.hashSecret);

    params.vnp_ResponseCode = "00"; // giả mạo thành công
    assert.equal(verifyReturnSignature(CONFIG, params), false);
  });

  test("thiếu vnp_SecureHash → từ chối, không sập", () => {
    assert.equal(verifyReturnSignature(CONFIG, { vnp_Amount: "1000" }), false);
  });

  test("params null/rỗng không làm sập hàm", () => {
    assert.equal(verifyReturnSignature(CONFIG, null), false);
    assert.equal(verifyReturnSignature(CONFIG, {}), false);
  });

  test("vnp_SecureHashType (nếu có) không được đưa vào dữ liệu ký", () => {
    // VNPay gửi kèm field vnp_SecureHashType nhưng field này KHÔNG tham
    // gia vào chuỗi ký — nếu code tính nhầm gồm cả field này thì mọi chữ
    // ký hợp lệ sẽ bị từ chối oan
    const base = {
      vnp_Amount: "50000000",
      vnp_TxnRef: "ORDER1",
      vnp_ResponseCode: "00",
    };
    const signed = makeSignedParams(base, CONFIG.hashSecret);
    signed.vnp_SecureHashType = "HmacSHA512"; // thêm SAU khi ký, như VNPay làm
    assert.equal(verifyReturnSignature(CONFIG, signed), true);
  });
});

describe("verifyIpnSignature — dùng cùng cơ chế với return nhưng endpoint riêng", () => {
  function makeSignedParams(params, hashSecret) {
    const sorted = Object.keys(params).sort();
    const signData = sorted.map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, "+")}`).join("&");
    const hmac = crypto.createHmac("sha512", hashSecret).update(signData).digest("hex");
    return { ...params, vnp_SecureHash: hmac };
  }

  test("IPN dùng chung logic xác minh, chữ ký đúng thì qua", () => {
    const params = makeSignedParams({ vnp_TxnRef: "T1", vnp_Amount: "1000000" }, CONFIG.hashSecret);
    assert.equal(verifyIpnSignature(CONFIG, params), true);
  });

  test("IPN chữ ký sai bị từ chối", () => {
    const params = makeSignedParams({ vnp_TxnRef: "T1", vnp_Amount: "1000000" }, "wrong");
    assert.equal(verifyIpnSignature(CONFIG, params), false);
  });
});
