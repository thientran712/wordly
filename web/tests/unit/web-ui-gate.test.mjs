import test from "node:test";
import assert from "node:assert/strict";
import { isWebUiEnabled, webUiGate, MOBILE_ONLY_PATH } from "../../src/lib/web-ui-gate.js";

// Chủ dự án tắt website (13/10/2026) — chỉ tắt, code giữ nguyên, bật lại bằng
// WEB_UI_ENABLED=1. Còn chạy: API (backend iOS), trang app/App Store cần, link email.

test("công tắc: mặc định tắt; chỉ '1'/'true' mới bật", () => {
  assert.equal(isWebUiEnabled({}), false);
  assert.equal(isWebUiEnabled({ WEB_UI_ENABLED: "0" }), false);
  assert.equal(isWebUiEnabled({ WEB_UI_ENABLED: "1" }), true);
  assert.equal(isWebUiEnabled({ WEB_UI_ENABLED: "true" }), true);
});

test("đang bật → mọi trang đi như cũ", () => {
  for (const p of ["/", "/login", "/profile", "/quiz"]) assert.equal(webUiGate(p, true), "allow");
});

test("đang tắt → API, privacy, support, auth, reset-password, email-templates vẫn chạy", () => {
  for (const p of ["/api/translate", "/api/push/devices", "/api/cron/send-emails", "/api/health",
    "/privacy", "/support", "/terms", "/auth/confirm", "/auth/callback", "/reset-password",
    "/email-templates/recovery.html", MOBILE_ONLY_PATH]) {
    assert.equal(webUiGate(p, false), "allow", p);
  }
});

test("đang tắt → các trang còn lại về trang 'có trên iPhone'", () => {
  for (const p of ["/", "/login", "/signup", "/forgot-password", "/profile", "/profile/email",
    "/quiz", "/journal", "/speak", "/practice", "/vocabulary-chat"]) {
    assert.equal(webUiGate(p, false), "mobile-only", p);
  }
});

test("không lọt qua bằng tiền tố giả: /privacy-x, /apix, /supportive", () => {
  for (const p of ["/privacy-x", "/apix", "/supportive", "/terms-old", "/auth", "/reset-password-old"]) {
    assert.equal(webUiGate(p, false), "mobile-only", p);
  }
});

test("middleware dùng cổng web-ui-gate trước mọi bước khác", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../src/middleware.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function middleware"));
  assert.ok(body.includes("webUiGate("), "middleware chưa gọi webUiGate");
  assert.ok(body.indexOf("webUiGate(") < body.indexOf("createServerClient("), "phải kiểm cổng trước khi tạo client Supabase");
});

test("middleware: /terms là trang công khai (không cần đăng nhập) như /privacy", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../src/middleware.js", import.meta.url), "utf8");
  assert.match(src, /path === "\/terms"/);
});
