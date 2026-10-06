// Seed dữ liệu demo cho trung tâm Anh ngữ — dùng để test UI B2B.
//
// Tạo: 3 lớp khác trình độ, ~18 học viên (user thật + membership), giáo
// viên, buổi học, bài giảng, bài tập (có nộp/chưa nộp/đã chấm), quiz, đề
// nói (có nộp/chưa nộp), quan hệ phụ huynh, học phí (đủ đóng/nợ/quá hạn),
// snapshot tiến độ (active/stalled/dropped).
//
// AN TOÀN: chỉ chạy khi CONFIRM_REMOTE=1 nếu trỏ remote (không phải local),
// theo đúng pattern của scripts/b2b-add-membership.mjs.
//
// Dùng: CONFIRM_REMOTE=1 node scripts/seed-demo-center.mjs <org_id>

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

const env = parseEnvFile(join(ROOT, ".env.local"));
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

const [orgId] = process.argv.slice(2);
if (!orgId) {
  console.error("Dùng: node scripts/seed-demo-center.mjs <org_id>");
  process.exit(1);
}
if (!URL_ || !KEY) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const host = new URL(URL_).hostname;
const isLocal = host === "127.0.0.1" || host === "localhost";
if (!isLocal && process.env.CONFIRM_REMOTE !== "1") {
  console.error(`\n⚠️  Đang trỏ tới môi trường KHÔNG phải local: ${host}`);
  console.error("Nếu thực sự muốn ghi ở đây, chạy lại với CONFIRM_REMOTE=1\n");
  process.exit(1);
}

const supabase = createClient(URL_, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString();
const dateStr = (d) => d.toISOString().slice(0, 10);

const FIRST_NAMES = ["An", "Bình", "Chi", "Dũng", "Hà", "Khang", "Linh", "Minh", "Nam", "Oanh",
  "Phúc", "Quỳnh", "Sơn", "Thảo", "Uyên", "Việt", "Xuân", "Yến", "Bảo", "Châu"];
const LAST_NAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi", "Đỗ", "Hồ"];
const fullName = () => `${rnd(LAST_NAMES)} ${rnd(FIRST_NAMES)}`;

async function ensureUser(email, name) {
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (found) return found.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: "Demo2026!" + Math.random().toString(36).slice(2, 8),
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) throw new Error(`Tạo user ${email} lỗi: ${error.message}`);
  return data.user.id;
}

async function ensureMembership(userId, role) {
  const { data: existing } = await supabase
    .from("memberships").select("id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("memberships")
    .insert({ org_id: orgId, user_id: userId, role, status: "active" })
    .select("id").single();
  if (error) throw new Error(`Tạo membership lỗi: ${error.message}`);
  return data.id;
}

async function main() {
  console.log(`\nMôi trường: ${host}${isLocal ? " (local)" : " (REMOTE)"}\n`);

  const { data: org, error: orgErr } = await supabase
    .from("organizations").select("id, name, plan").eq("id", orgId).single();
  if (orgErr || !org) throw new Error(`Không tìm thấy org: ${orgErr?.message ?? ""}`);
  console.log(`Trung tâm: ${org.name} (${org.plan})\n`);

  // ── 1. Giáo viên (dùng lại teacher có sẵn nếu có, tạo thêm 1) ──
  console.log("▸ Tạo giáo viên...");
  const teacherId2 = await ensureUser("gv.demo2@wordly-seed.test", "Cô Hương");
  const teacherMem2 = await ensureMembership(teacherId2, "teacher");

  const { data: existingTeachers } = await supabase
    .from("memberships").select("id").eq("org_id", orgId).eq("role", "teacher");
  const teacherMems = existingTeachers.map((t) => t.id);
  console.log(`  ${teacherMems.length} giáo viên sẵn sàng`);

  // ── 2. Lớp học (giữ lớp có sẵn, thêm 2 lớp mới) ──
  console.log("\n▸ Tạo lớp học...");
  const classSpecs = [
    { name: "TOEIC 500+ Buổi tối", teacher: teacherMems[0] },
    { name: "Giao tiếp cơ bản A1-A2", teacher: teacherMems[1] || teacherMems[0] },
  ];
  const classIds = [];
  for (const spec of classSpecs) {
    const { data: existing } = await supabase
      .from("classes").select("id").eq("org_id", orgId).eq("name", spec.name).maybeSingle();
    if (existing) { classIds.push(existing.id); continue; }

    const { data, error } = await supabase
      .from("classes")
      .insert({ org_id: orgId, name: spec.name, teacher_membership_id: spec.teacher, status: "active" })
      .select("id").single();
    if (error) throw new Error(`Tạo lớp lỗi: ${error.message}`);
    classIds.push(data.id);
  }

  const { data: existingClass } = await supabase
    .from("classes").select("id, name").eq("org_id", orgId).eq("name", "IELTS FOUNDATION 3").maybeSingle();
  if (existingClass) classIds.unshift(existingClass.id);

  console.log(`  ${classIds.length} lớp sẵn sàng`);

  // Gán GV vào class_members cho từng lớp (nếu chưa)
  for (let i = 0; i < classIds.length; i++) {
    const tMem = i === 0 ? teacherMems[0] : classSpecs[i - 1]?.teacher;
    if (!tMem) continue;
    const { data: exists } = await supabase
      .from("class_members").select("id").eq("class_id", classIds[i]).eq("membership_id", tMem).maybeSingle();
    if (!exists) {
      await supabase.from("class_members").insert({ class_id: classIds[i], membership_id: tMem, role_in_class: "teacher" });
    }
  }

  // ── 3. Học viên: 18 người, chia đều 3 lớp ──
  console.log("\n▸ Tạo học viên...");
  const studentMems = [];
  for (let i = 1; i <= 18; i++) {
    const email = `hocvien${i}@wordly-seed.test`;
    const name = fullName();
    const uid = await ensureUser(email, name);
    const mem = await ensureMembership(uid, "student");
    studentMems.push({ mem, name, uid });

    const classId = classIds[i % classIds.length];
    const { data: exists } = await supabase
      .from("class_members").select("id").eq("class_id", classId).eq("membership_id", mem).maybeSingle();
    if (!exists) {
      await supabase.from("class_members").insert({ class_id: classId, membership_id: mem, role_in_class: "student" });
    }
  }
  console.log(`  ${studentMems.length} học viên đã vào lớp`);

  // ── 4. Phụ huynh: 6 người, mỗi người theo 1-2 con ──
  console.log("\n▸ Tạo phụ huynh + liên kết...");
  let guardianCount = 0;
  for (let i = 1; i <= 6; i++) {
    const email = `phuhuynh${i}@wordly-seed.test`;
    const uid = await ensureUser(email, `Phụ huynh em ${fullName()}`);
    const mem = await ensureMembership(uid, "parent");

    const children = studentMems.slice((i - 1) * 3, (i - 1) * 3 + (i <= 2 ? 2 : 1));
    for (const child of children) {
      const { data: exists } = await supabase
        .from("guardian_links").select("id")
        .eq("guardian_membership_id", mem).eq("student_membership_id", child.mem).maybeSingle();
      if (!exists) {
        const { error } = await supabase.from("guardian_links").insert({
          org_id: orgId,
          guardian_membership_id: mem,
          student_membership_id: child.mem,
          relationship: i % 2 === 0 ? "mother" : "father",
          receive_reports: true,
        });
        if (!error) guardianCount++;
      }
    }
  }
  console.log(`  ${guardianCount} liên kết phụ huynh-học viên`);

  // ── 5. Buổi học cho mỗi lớp ──
  console.log("\n▸ Tạo buổi học...");
  const sessionsByClass = {};
  for (const classId of classIds) {
    const sessions = [];
    for (let i = 1; i <= 4; i++) {
      const title = `Buổi ${i}: ${rnd(["Present Perfect", "Vocabulary - Travel", "Listening Practice", "Speaking - Daily Life", "Reading Comprehension"])}`;
      const { data: exists } = await supabase
        .from("class_sessions").select("id").eq("class_id", classId).eq("title", title).maybeSingle();
      if (exists) { sessions.push(exists.id); continue; }

      const { data, error } = await supabase
        .from("class_sessions")
        .insert({
          class_id: classId, title, order_index: i,
          session_date: dateStr(new Date(Date.now() - (5 - i) * 7 * 86400_000)),
          status: "published",
        })
        .select("id").single();
      if (error) throw new Error(`Tạo buổi học lỗi: ${error.message}`);
      sessions.push(data.id);
    }
    sessionsByClass[classId] = sessions;
  }
  console.log(`  ${Object.values(sessionsByClass).flat().length} buổi học`);

  // ── 6. Bài giảng (link ngoài — không cần Storage) ──
  console.log("\n▸ Tạo tài liệu bài giảng...");
  let materialCount = 0;
  for (const classId of classIds) {
    const sessions = sessionsByClass[classId];
    for (const sessionId of sessions.slice(0, 2)) {
      const { data: exists } = await supabase
        .from("lesson_materials").select("id").eq("session_id", sessionId).limit(1);
      if (exists?.length) continue;

      const { error } = await supabase.from("lesson_materials").insert({
        session_id: sessionId, kind: "link", title: "Slide bài giảng (Google Drive)",
        external_url: "https://drive.google.com/file/d/demo-seed-slide",
        allow_download: true,
      });
      if (!error) materialCount++;
    }
  }
  console.log(`  ${materialCount} tài liệu`);

  // ── 7. Bài tập: mỗi lớp 1 bài, có câu mcq/fill/essay ──
  console.log("\n▸ Tạo bài tập...");
  const homeworkByClass = {};
  for (const classId of classIds) {
    const title = "Bài tập: Present Perfect & Từ vựng";
    const { data: exists } = await supabase
      .from("homework").select("id").eq("class_id", classId).eq("title", title).maybeSingle();
    if (exists) { homeworkByClass[classId] = exists.id; continue; }

    const questions = [
      { id: "q1", type: "mcq", prompt: "She ___ (live) in Hanoi since 2020.", points: 1,
        options: ["live", "lived", "has lived", "living"], answer: 2 },
      { id: "q2", type: "fill", prompt: "I have never ___ (see) such a beautiful place.", points: 1, answer: ["seen"] },
      { id: "q3", type: "essay", prompt: "Describe your favorite place to travel in 3-5 sentences.", points: 3 },
    ];
    const { data, error } = await supabase
      .from("homework")
      .insert({
        class_id: classId, title, instructions: "Hoàn thành trước hạn. Đọc kỹ câu hỏi trước khi trả lời.",
        questions, total_points: 5, due_at: daysAgo(-7), status: "published",
      })
      .select("id").single();
    if (error) throw new Error(`Tạo bài tập lỗi: ${error.message}`);
    homeworkByClass[classId] = data.id;
  }
  console.log(`  ${Object.keys(homeworkByClass).length} bài tập`);

  // ── 8. Bài nộp: đa dạng trạng thái (đã chấm / chờ chấm / chưa nộp) ──
  console.log("\n▸ Tạo bài nộp bài tập...");
  let submissionCount = 0;
  for (const [classId, hwId] of Object.entries(homeworkByClass)) {
    const { data: members } = await supabase
      .from("class_members").select("membership_id").eq("class_id", classId).eq("role_in_class", "student");
    const memIds = (members || []).map((m) => m.membership_id);

    for (let i = 0; i < memIds.length; i++) {
      const mode = i % 3; // 0: đã chấm, 1: chờ chấm, 2: chưa nộp
      if (mode === 2) continue;

      const answers = { q1: 2, q2: "seen", q3: "I love visiting Da Lat because of the cool weather and beautiful flowers. It feels peaceful and relaxing." };
      const { data: exists } = await supabase
        .from("homework_submissions").select("id").eq("homework_id", hwId).eq("membership_id", memIds[i]).maybeSingle();
      if (exists) continue;

      const payload = {
        homework_id: hwId, membership_id: memIds[i], answers,
        status: mode === 0 ? "graded" : "submitted",
        submitted_at: daysAgo(2),
      };
      if (mode === 0) {
        // Cột đúng: auto_score/manual_score/total_score, KHÔNG có cột "score"
        payload.auto_score = 2; // 2 câu khách quan (mcq + fill), mỗi câu 1 điểm
        payload.manual_score = 2; // câu essay GV chấm 2/3 điểm
        payload.total_score = 4;
        payload.feedback = "Làm tốt! Chú ý thì hoàn thành ở câu 1.";
        payload.graded_by = null;
        payload.graded_at = daysAgo(1);
      }
      const { error } = await supabase.from("homework_submissions").insert(payload);
      if (!error) submissionCount++;
    }
  }
  console.log(`  ${submissionCount} bài nộp`);

  // ── 9. Đề nói + bài nộp (chỉ đăng ký, không có audio thật) ──
  console.log("\n▸ Tạo đề nói...");
  let promptCount = 0;
  for (const classId of classIds) {
    const title = "IELTS Speaking Part 2: Describe a book you enjoyed";
    const { data: exists } = await supabase
      .from("speaking_prompts").select("id").eq("class_id", classId).eq("title", title).maybeSingle();
    if (exists) continue;
    const { error } = await supabase.from("speaking_prompts").insert({
      class_id: classId, title,
      prompt_text: "Describe a book you enjoyed reading. You should say: what it was about, when you read it, why you liked it.",
      max_seconds: 120, status: "published", due_at: daysAgo(-5),
    });
    if (!error) promptCount++;
  }
  console.log(`  ${promptCount} đề nói`);

  // ── 10. Học phí: đủ đóng / còn nợ / quá hạn ──
  console.log("\n▸ Tạo học phí...");
  let tuitionCount = 0, paymentCount = 0;
  for (let i = 0; i < studentMems.length; i++) {
    const { mem } = studentMems[i];
    const classId = classIds[i % classIds.length];
    const unitFee = 500_000;
    const unitCount = 8;
    const subtotal = unitFee * unitCount;
    const scenario = i % 4; // 0: đủ, 1: một phần, 2: chưa đóng, 3: quá hạn

    const { data: exists } = await supabase
      .from("tuition_records").select("id").eq("membership_id", mem).eq("class_id", classId).maybeSingle();
    if (exists) continue;

    const { data: record, error } = await supabase
      .from("tuition_records")
      .insert({
        membership_id: mem, class_id: classId, title: "Học phí tháng 9/2026",
        model: "per_month", unit_fee: unitFee, unit_count: unitCount,
        subtotal, discount_amount: 0, total_due: subtotal,
        due_date: dateStr(new Date(Date.now() + (scenario === 3 ? -5 : 15) * 86400_000)),
      })
      .select("id").single();
    if (error) { console.log(`    lỗi tuition: ${error.message}`); continue; }
    tuitionCount++;

    if (scenario === 0) {
      await supabase.from("tuition_payments").insert({
        tuition_record_id: record.id, amount: subtotal, method: "bank_transfer", paid_at: daysAgo(3),
      });
      paymentCount++;
    } else if (scenario === 1) {
      await supabase.from("tuition_payments").insert({
        tuition_record_id: record.id, amount: Math.floor(subtotal / 2), method: "cash", paid_at: daysAgo(3),
      });
      paymentCount++;
    }
    // scenario 2, 3: chưa đóng gì
  }
  console.log(`  ${tuitionCount} khoản học phí, ${paymentCount} lượt đóng tiền`);

  // ── 11. Quiz attempts ──
  console.log("\n▸ Tạo lượt chơi quiz...");
  let quizCount = 0;
  for (let i = 0; i < studentMems.length; i += 2) {
    const { mem, uid } = studentMems[i];
    const classId = classIds[i % classIds.length];
    const total = 10;
    const correct = 5 + Math.floor(Math.random() * 5);
    const { error } = await supabase.from("quiz_attempts").insert({
      user_id: uid, class_id: classId, org_id: orgId, membership_id: mem,
      mode: rnd(["en_to_vi", "vi_to_en"]), total, correct,
      percent: Math.round((correct / total) * 100),
      duration_ms: 60_000 + Math.floor(Math.random() * 120_000),
      created_at: daysAgo(Math.floor(Math.random() * 6)),
    });
    if (!error) quizCount++;
  }
  console.log(`  ${quizCount} lượt chơi quiz`);

  // ── 12. Snapshot tiến độ: active / stalled / dropped đa dạng ──
  console.log("\n▸ Tạo snapshot tiến độ...");
  let snapCount = 0;
  const today = dateStr(new Date());
  for (let i = 0; i < studentMems.length; i++) {
    const { mem } = studentMems[i];
    const bucket = i % 3; // 0: active, 1: stalled, 2: dropped
    const inactiveDays = bucket === 0 ? Math.floor(Math.random() * 3) : bucket === 1 ? 8 + Math.floor(Math.random() * 5) : 20 + Math.floor(Math.random() * 15);

    const { data: exists } = await supabase
      .from("student_progress_snapshots").select("id").eq("membership_id", mem).eq("snapshot_date", today).maybeSingle();
    if (exists) continue;

    const { error } = await supabase.from("student_progress_snapshots").insert({
      membership_id: mem, org_id: orgId, snapshot_date: today,
      words_saved: 20 + Math.floor(Math.random() * 200),
      words_due: Math.floor(Math.random() * 15),
      streak_days: bucket === 0 ? 3 + Math.floor(Math.random() * 20) : 0,
      last_active_at: daysAgo(inactiveDays),
      emails_sent: Math.floor(Math.random() * 5),
      practice_minutes: Math.floor(Math.random() * 300),
    });
    if (!error) snapCount++;
  }
  console.log(`  ${snapCount} snapshot tiến độ`);

  console.log("\n✅ SEED HOÀN TẤT\n");
  console.log(`  Lớp:          ${classIds.length}`);
  console.log(`  Học viên:     ${studentMems.length}`);
  console.log(`  Phụ huynh:    6`);
  console.log(`  Buổi học:     ${Object.values(sessionsByClass).flat().length}`);
  console.log(`  Bài tập:      ${Object.keys(homeworkByClass).length} (${submissionCount} bài nộp)`);
  console.log(`  Đề nói:       ${promptCount}`);
  console.log(`  Học phí:      ${tuitionCount} khoản (${paymentCount} đã đóng ít nhất 1 phần)`);
  console.log(`  Quiz:         ${quizCount} lượt chơi`);
  console.log(`  Snapshot:     ${snapCount}`);
  console.log(`\n  Mật khẩu học viên demo: xem log tạo user ở trên (random), hoặc dùng`);
  console.log(`  "Quên mật khẩu" với email dạng hocvien{1-18}@wordly-seed.test\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
});
