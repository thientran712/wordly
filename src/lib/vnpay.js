// Tích hợp thanh toán VNPay — logic thuần, không phụ thuộc DB/network.
// Xem tests/unit/vnpay.test.mjs (20 ca).
//
// ĐÂY LÀ NGHIỆP VỤ TIỀN THẬT. verifyReturnSignature/verifyIpnSignature là
// CỔNG BẢO MẬT QUAN TRỌNG NHẤT của tính năng này: nếu xác minh sai, kẻ tấn
// công có thể giả mạo "đã thanh toán thành công" mà không trả tiền —
// nghiêm trọng hơn bất kỳ lỗ hổng nào khác trong hệ thống vì gây thiệt hại
// tài chính trực tiếp cho trung tâm.
//
// Thuật toán theo tài liệu VNPay chính thức (https://sandbox.vnpayment.vn):
//   1. Sắp xếp tham số theo thứ tự alphabet của key
//   2. Nối thành chuỗi key=value&key=value (encode value theo
//      encodeURIComponent, nhưng dấu cách '%20' phải đổi thành '+')
//   3. HMAC-SHA512 chuỗi đó với Hash Secret → vnp_SecureHash
//   4. Khi xác minh: tính lại hash từ CHÍNH các tham số nhận được (trừ
//      vnp_SecureHash và vnp_SecureHashType) rồi so sánh

import crypto from "node:crypto";

export const VNPAY_VERSION = "2.1.0";
export const VNPAY_COMMAND = "pay";

/**
 * VNPay yêu cầu amount nhân 100 vì API không nhận số thập phân — đây là
 * cách biểu diễn "không có phần lẻ" cho VND, không phải đổi đơn vị tiền.
 */
export function formatVnpAmount(vndAmount) {
  if (!Number.isInteger(vndAmount) || vndAmount <= 0) {
    throw new Error(`Số tiền không hợp lệ: ${vndAmount}`);
  }
  return String(vndAmount * 100);
}

/** Chiều ngược lại — dùng khi đọc vnp_Amount từ callback VNPay. */
export function vndFromVnpAmount(vnpAmountStr) {
  const n = Number(vnpAmountStr);
  if (!Number.isFinite(n)) return null;
  return Math.round(n / 100);
}

/** Định dạng yyyyMMddHHmmss theo giờ Việt Nam (UTC+7) — VNPay yêu cầu giờ VN. */
export function formatVnpDate(date) {
  const vnTime = new Date(date.getTime() + 7 * 3600_000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    vnTime.getUTCFullYear() +
    pad(vnTime.getUTCMonth() + 1) +
    pad(vnTime.getUTCDate()) +
    pad(vnTime.getUTCHours()) +
    pad(vnTime.getUTCMinutes()) +
    pad(vnTime.getUTCSeconds())
  );
}

/**
 * Chuỗi ký theo ĐÚNG quy tắc VNPay: sắp xếp key theo alphabet, encode value
 * bằng encodeURIComponent NHƯNG thay '%20' bằng '+' (VNPay dùng chuẩn
 * application/x-www-form-urlencoded, không phải encodeURIComponent thuần).
 *
 * KHÔNG bao gồm vnp_SecureHash và vnp_SecureHashType — hai field này được
 * VNPay thêm vào SAU khi ký, nên nếu đưa vào chuỗi ký thì chữ ký tính lại
 * sẽ luôn sai (đây chính là ca test "vnp_SecureHashType không tham gia ký").
 */
function buildSignData(params) {
  const keys = Object.keys(params)
    .filter((k) => k !== "vnp_SecureHash" && k !== "vnp_SecureHashType")
    .sort();
  return keys
    .map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, "+")}`)
    .join("&");
}

function hmacSha512(data, secret) {
  return crypto.createHmac("sha512", secret).update(data, "utf-8").digest("hex");
}

/**
 * So sánh hai chuỗi không lộ thời gian xử lý (chống timing attack) — dùng
 * cho so sánh chữ ký, vì so sánh bằng `===` thường có thể bị đo thời gian
 * để dò từng ký tự đúng/sai.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), "utf-8");
  const bufB = Buffer.from(String(b), "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Tạo URL thanh toán VNPay để redirect người dùng sang.
 *
 * @param config    { tmnCode, hashSecret, paymentUrl }
 * @param order     { amount (VND), orderId, orderInfo, ipAddr, returnUrl }
 */
export function buildPaymentUrl(config, order) {
  const { tmnCode, hashSecret, paymentUrl } = config;
  const { amount, orderId, orderInfo, ipAddr, returnUrl } = order;

  const params = {
    vnp_Version: VNPAY_VERSION,
    vnp_Command: VNPAY_COMMAND,
    vnp_TmnCode: tmnCode,
    vnp_Amount: formatVnpAmount(amount), // throw nếu amount không hợp lệ
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: formatVnpDate(new Date()),
  };

  const signData = buildSignData(params);
  const secureHash = hmacSha512(signData, hashSecret);

  const url = new URL(paymentUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("vnp_SecureHash", secureHash);

  return url.toString();
}

/**
 * Xác minh chữ ký từ trang return (người dùng được redirect về sau thanh
 * toán) hoặc IPN (VNPay gọi server-to-server để báo kết quả cuối cùng).
 *
 * QUAN TRỌNG: hàm này KHÔNG được throw — mọi input lạ phải trả về false,
 * vì đây là hàng rào đầu tiên nhận dữ liệu từ bên ngoài internet.
 */
export function verifyReturnSignature(config, params) {
  if (!params || typeof params !== "object") return false;
  const receivedHash = params.vnp_SecureHash;
  if (typeof receivedHash !== "string" || !receivedHash) return false;

  try {
    const signData = buildSignData(params);
    const expectedHash = hmacSha512(signData, config.hashSecret);
    return safeEqual(receivedHash.toLowerCase(), expectedHash.toLowerCase());
  } catch {
    return false;
  }
}

// IPN (server-to-server) dùng CHÍNH XÁC cùng thuật toán ký với return URL
// (client redirect) theo tài liệu VNPay — tách hàm riêng để rõ ý ở nơi gọi,
// và để sau này nếu VNPay đổi giao thức IPN thì chỉ sửa một chỗ.
export const verifyIpnSignature = verifyReturnSignature;
