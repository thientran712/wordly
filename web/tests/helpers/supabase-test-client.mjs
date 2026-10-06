// Test harness cho RLS.
//
// Nguyên tắc: test phải chạy qua ĐÚNG đường mà người dùng thật đi —
// anon key + JWT của phiên đăng nhập. Nếu test dùng service role thì nó
// bypass RLS và chứng minh được đúng con số 0.
//
// Mỗi test tạo user thật qua Auth Admin API, đăng nhập để lấy JWT, rồi
// query bằng anon client mang JWT đó. Cuối cùng dọn sạch.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

// Đọc env bằng tay — cùng cách các script trong scripts/ đang làm, giữ nhất
// quán và không thêm dependency (dotenv không có trong package.json).
//
// Thứ tự ưu tiên có chủ đích: .env.test.local TRƯỚC .env.local.
// Lý do: .env.local chứa credential PRODUCTION. Tách file riêng cho test để
// không bao giờ vô tình chạy test phá dữ liệu thật.
function parseEnvFile(path) {
  const out = {};
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      if (/^\s*#/.test(line)) continue;
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // File không tồn tại là bình thường
  }
  return out;
}

function loadEnv() {
  const testEnv = parseEnvFile(join(ROOT, ".env.test.local"));
  // Nếu có .env.test.local với URL Supabase thì dùng RIÊNG file đó, không
  // trộn với .env.local để tránh lẫn credential production.
  if (testEnv.NEXT_PUBLIC_SUPABASE_URL) {
    return { ...testEnv, ...pickEnvOverrides() };
  }
  return { ...parseEnvFile(join(ROOT, ".env.local")), ...pickEnvOverrides() };
}

// Chỉ lấy các biến liên quan từ process.env (cho CI), không kéo cả môi trường.
function pickEnvOverrides() {
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ALLOW_REMOTE_RLS_TESTS",
  ];
  const out = {};
  for (const k of keys) if (process.env[k]) out[k] = process.env[k];
  return out;
}

const env = loadEnv();

export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Test này TẠO VÀ XOÁ dữ liệu thật, nên chỉ được chạy trên Supabase local.
 * Nhận diện local qua host: 127.0.0.1 / localhost / *.local.
 */
function isLocalSupabase(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host.endsWith(".local");
  } catch {
    return false;
  }
}

/**
 * Kiểm tra đủ điều kiện để chạy test RLS.
 * Trả về lý do bỏ qua, hoặc null nếu chạy được.
 *
 * CHẶN AN TOÀN: từ chối chạy nếu URL không phải local. Test sẽ tạo org, user
 * và lớp thật rồi xoá đi — chạy trên production là phá dữ liệu khách hàng.
 * Muốn cố tình chạy lên remote thì đặt ALLOW_REMOTE_RLS_TESTS=1.
 */
export function skipReason() {
  if (!SUPABASE_URL) return "thiếu NEXT_PUBLIC_SUPABASE_URL";
  if (!ANON_KEY) return "thiếu NEXT_PUBLIC_SUPABASE_ANON_KEY";
  if (!SERVICE_KEY) return "thiếu SUPABASE_SERVICE_ROLE_KEY";

  if (!isLocalSupabase(SUPABASE_URL) && env.ALLOW_REMOTE_RLS_TESTS !== "1") {
    return (
      `NEXT_PUBLIC_SUPABASE_URL trỏ tới môi trường KHÔNG phải local ` +
      `(${safeHost(SUPABASE_URL)}). Test RLS tạo/xoá dữ liệu thật nên chỉ chạy local.\n` +
      `    Chạy: npx supabase start  →  rồi dùng .env.test.local với URL 127.0.0.1`
    );
  }
  return null;
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "không đọc được";
  }
}

/** Client service-role — CHỈ dùng để dựng/dọn dữ liệu test, không để assert. */
export function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Client anon chưa đăng nhập — mô phỏng khách. */
export function guestClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let seq = 0;
function uniqueEmail(tag) {
  seq += 1;
  return `rlstest+${tag}-${Date.now()}-${seq}@wordly.test`;
}

/**
 * Tạo user thật rồi đăng nhập, trả về client mang JWT của user đó.
 * Đây là mấu chốt: `client` dưới đây chịu RLS đúng như người dùng thật.
 */
export async function createTestUser(tag = "u") {
  const admin = adminClient();
  const email = uniqueEmail(tag);
  const password = `Test-${Math.random().toString(36).slice(2)}-Aa1!`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw new Error(`tạo user test thất bại: ${createErr.message}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`đăng nhập user test thất bại: ${signInErr.message}`);

  return { id: created.user.id, email, password, client };
}

/** Buộc lấy JWT mới — cần sau khi đổi membership vì org context nằm trong token. */
export async function refreshUser(user) {
  const { error } = await user.client.auth.refreshSession();
  if (error) throw new Error(`refresh session thất bại: ${error.message}`);
}

/** Đọc custom claims trong JWT hiện tại (để kiểm tra hook nhúng org context). */
export async function jwtClaims(user) {
  const { data } = await user.client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

/**
 * Dọn dẹp: xoá user test và mọi dữ liệu cascade theo.
 * Gọi trong `after()` để không để lại rác trên database.
 */
export async function cleanupUsers(...users) {
  const admin = adminClient();
  for (const u of users) {
    if (!u?.id) continue;
    try {
      await admin.auth.admin.deleteUser(u.id);
    } catch {
      // Không làm test fail vì lỗi dọn dẹp
    }
  }
}

/** Xoá các org test theo id. */
export async function cleanupOrgs(...orgIds) {
  const admin = adminClient();
  for (const id of orgIds.filter(Boolean)) {
    try {
      await admin.from("organizations").delete().eq("id", id);
    } catch {
      // bỏ qua
    }
  }
}
