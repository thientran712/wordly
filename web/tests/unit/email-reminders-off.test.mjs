import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Chủ dự án bỏ email nhắc học (13/10/2026) — chỉ còn thông báo đẩy. Cron VPS vẫn
// gọi /api/cron/send-emails (giữ đường dẫn để khỏi sửa crontab) nhưng route chỉ
// chạy push. Dữ liệu email_* giữ nguyên trong DB.
const WEB = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(join(WEB, p), "utf8");

test("cron không còn gửi email nhắc học", () => {
  const route = read("src/app/api/cron/send-emails/route.js");
  assert.ok(!route.includes("runDueEmailSends"), "route cron còn gọi lượt gửi email");
  assert.ok(route.includes("runDuePushSends"), "route cron phải còn chạy push");
});

test("web không còn lối vào trang Cài đặt Email", () => {
  assert.ok(!read("src/components/layout/AppSidebar.js").includes("/profile/email"));
});

test("màn Dịch trên web không còn banner mời bật email nhắc học", () => {
  const src = read("src/components/home/InlineTranslate.js");
  assert.ok(!src.includes("/api/email-preferences"));
  assert.ok(!src.includes("showEmailInvite"));
});
