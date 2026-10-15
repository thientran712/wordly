// Verifier THẬT của Apple (@apple/app-store-server-library — thư viện chính
// thức) với chứng chỉ gốc công khai của Apple (./certs, tải từ
// https://www.apple.com/certificateauthority/). Logic dùng nó ở ./apple.js.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SignedDataVerifier, Environment } from "@apple/app-store-server-library";
import { BUNDLE_ID, APP_APPLE_ID, verifyAppleJws } from "./apple.js";

const CERT_FILES = ["AppleRootCA-G3.cer", "AppleIncRootCertificate.cer"];

// Đọc theo process.cwd() (= thư mục web/ khi dev/test, /app trong image
// standalone). next.config.mjs khai outputFileTracingIncludes để file .cer
// được chép vào bản build; turbopackIgnore để tracing không kéo cả thư mục dự án.
export function loadAppleRootCerts() {
  return CERT_FILES.map((f) => readFileSync(join(/*turbopackIgnore: true*/ process.cwd(), "src/lib/billing/certs", f)));
}

const ENV_MAP = { Production: Environment.PRODUCTION, Sandbox: Environment.SANDBOX };
const verifiers = new Map();

/**
 * Một verifier mỗi môi trường, giữ lại giữa các request (nó cache khoá công
 * khai đã kiểm). enableOnlineChecks = true: kiểm chứng chỉ bị thu hồi (OCSP)
 * và hạn chứng chỉ theo giờ hiện tại — Apple khuyến nghị cho server.
 */
export function getAppleVerifier(env) {
  if (!ENV_MAP[env]) throw new Error(`Môi trường App Store không hỗ trợ: ${env}`);
  if (!verifiers.has(env)) {
    verifiers.set(env, new SignedDataVerifier(
      loadAppleRootCerts(), true, ENV_MAP[env], BUNDLE_ID,
      env === "Production" ? APP_APPLE_ID : undefined,
    ));
  }
  return verifiers.get(env);
}

/** verify(jws, "transaction" | "renewal" | "notification") cho apple.js */
export function verifyApple(jws, what) {
  return verifyAppleJws(jws, what, getAppleVerifier);
}
