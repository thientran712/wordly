// Verify JWT bằng WebCrypto — logic thuần, không phụ thuộc DB/network.
// Xem tests/unit/jwt-verify.test.mjs (9 ca).
//
// VÌ SAO CÓ FILE NÀY: supabase.auth.getClaims() verify JWT bằng JWKS, nhưng
// cache JWKS nằm trong RAM của GoTrueClient instance. Trên Vercel
// serverless, mỗi cold start tạo instance MỚI nên cache mất tác dụng —
// middleware gọi getClaims() ở MỌI request nghĩa là MỌI request phải gọi
// mạng tới /auth/v1/.well-known/jwks.json (~150-330ms đo được thực tế
// 7/9/2026). Đây là nguyên nhân chính khiến module B2B chậm: mỗi trang gọi
// 3-5 API song song, mỗi API tự trả giá network đó một lần.
//
// Sửa: cache JWKS trong Postgres (src/lib/jwks-cache.js — dùng chung mọi
// serverless instance), tự verify chữ ký bằng WebCrypto ở đây.
//
// Dùng thư viện `jose` (chuẩn công nghiệp cho JWT/JWK trên Web Crypto API,
// không tự viết verify chữ ký tay — đây là code bảo mật, không phải chỗ để
// "tự làm cho vui").

import { importJWK, jwtVerify } from "jose";

// Dùng atob/TextDecoder thay vì Buffer: middleware chạy Edge Runtime
// (không có Buffer), còn atob/TextDecoder có sẵn ở cả Edge lẫn Node —
// một hàm dùng được ở mọi nơi, không cần 2 bản riêng.
function base64UrlDecode(str) {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

/** Đọc payload JWT KHÔNG xác minh chữ ký — dùng khi chỉ cần đọc, không cần tin. */
export function decodeJwtPayload(jwt) {
  if (typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

/** exp tính bằng giây Unix. Thiếu exp coi như hết hạn (fail-closed). */
export function isJwtExpired(payload) {
  if (!payload || typeof payload.exp !== "number") return true;
  return payload.exp < Math.floor(Date.now() / 1000);
}

/**
 * Verify chữ ký JWT bằng JWKS đã có sẵn (không gọi mạng ở đây — JWKS phải
 * được truyền vào, lấy từ cache Postgres hoặc gọi mạng ở lớp trên).
 *
 * KHÔNG BAO GIỜ throw — mọi input lạ trả về { valid: false }, vì đây là
 * hàng rào đầu tiên nhận JWT từ client.
 *
 * @returns { valid: true, payload } | { valid: false, error }
 */
export async function verifyJwtWithJwks(jwt, jwks) {
  if (typeof jwt !== "string" || !jwt) {
    return { valid: false, error: "JWT rỗng hoặc sai kiểu" };
  }

  const parts = jwt.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "JWT sai định dạng" };
  }

  let header;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]));
  } catch {
    return { valid: false, error: "Không đọc được header JWT" };
  }

  const jwk = (jwks?.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) {
    return { valid: false, error: `Không tìm thấy key cho kid: ${header.kid}` };
  }

  try {
    const key = await importJWK(jwk, header.alg);
    // jwtVerify tự kiểm cả chữ ký LẪN exp — không cần gọi isJwtExpired
    // riêng, nhưng hàm đó vẫn export để nơi khác dùng khi chỉ cần đọc payload
    // không qua verify (ví dụ log debug).
    const { payload } = await jwtVerify(jwt, key, {
      algorithms: [header.alg],
    });
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}
