// Tạo trung tâm + gán owner. Dùng service role.
//
// Theo thiết kế, RLS KHÔNG cho người dùng tự tạo organization — onboarding
// trung tâm là quy trình bán hàng có kiểm soát. Script này là công cụ của
// super-admin (anh), không phải tính năng self-service.
//
// Dùng:
//   node scripts/b2b-create-org.mjs "Trung tâm ABC" owner@email.com [plan]
//
// plan: basic (mặc định) | pro | enterprise

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (/^\s*#/.test(line)) continue;
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}

// Ưu tiên .env.test.local để mặc định làm việc trên local, tránh vô tình
// tạo org trên production.
const testEnv = parseEnvFile(join(ROOT, ".env.test.local"));
const env = testEnv.NEXT_PUBLIC_SUPABASE_URL
  ? testEnv
  : parseEnvFile(join(ROOT, ".env.local"));

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

const [name, ownerEmail, plan = "basic"] = process.argv.slice(2);

if (!name || !ownerEmail) {
  console.error("Dùng: node scripts/b2b-create-org.mjs \"Tên trung tâm\" owner@email.com [basic|pro|enterprise]");
  process.exit(1);
}
if (!URL_ || !KEY) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const host = new URL(URL_).hostname;
const isLocal = host === "127.0.0.1" || host === "localhost";

// Xác nhận rõ ràng khi thao tác trên môi trường không phải local.
if (!isLocal && process.env.CONFIRM_REMOTE !== "1") {
  console.error(`\n⚠️  Đang trỏ tới môi trường KHÔNG phải local: ${host}`);
  console.error("Nếu thực sự muốn tạo org ở đây, chạy lại với CONFIRM_REMOTE=1\n");
  process.exit(1);
}

const PLAN_LIMITS = {
  basic: 5 * 1024 ** 3,
  pro: 50 * 1024 ** 3,
  enterprise: 500 * 1024 ** 3,
};

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")     // bỏ dấu tiếng Việt
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "org";

const supabase = createClient(URL_, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`\nMôi trường: ${host}${isLocal ? " (local)" : " (REMOTE)"}`);

  // 1. Tìm user theo email
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`Không liệt kê được user: ${listErr.message}`);

  const user = list.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase());
  if (!user) {
    console.error(`\n✗ Không tìm thấy user với email ${ownerEmail}`);
    console.error("  Hãy đăng ký tài khoản đó trước tại /signup, rồi chạy lại script.\n");
    process.exit(1);
  }

  // 2. Tạo org (slug phải unique)
  let org = null;
  const base = slugify(name);
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name, slug, plan, status: "trial",
                trial_ends_at: new Date(Date.now() + 30 * 86400_000).toISOString() })
      .select()
      .single();
    if (!error) { org = data; break; }
    if (error.code !== "23505") throw new Error(`Tạo org lỗi: ${error.message}`);
  }
  if (!org) throw new Error("Không tạo được org (slug trùng nhiều lần)");

  // 3. Gán owner
  const { error: memErr } = await supabase.from("memberships").insert({
    org_id: org.id, user_id: user.id, role: "owner", status: "active",
  });
  if (memErr) throw new Error(`Gán owner lỗi: ${memErr.message}`);

  // 4. Khởi tạo quota theo gói
  await supabase.from("org_storage_usage").upsert(
    { org_id: org.id, bytes_used: 0, bytes_limit: PLAN_LIMITS[plan] ?? PLAN_LIMITS.basic },
    { onConflict: "org_id" }
  );

  console.log(`\n✓ Đã tạo trung tâm`);
  console.log(`  Tên:    ${org.name}`);
  console.log(`  ID:     ${org.id}`);
  console.log(`  Slug:   ${org.slug}`);
  console.log(`  Gói:    ${org.plan} (dùng thử 30 ngày)`);
  console.log(`  Owner:  ${ownerEmail}`);
  console.log(`\n⚠️  Owner phải ĐĂNG XUẤT rồi ĐĂNG NHẬP LẠI để JWT nhận quyền mới.`);
  console.log(`   (ngữ cảnh org nằm trong access token)\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
});
