// Test cô lập tenant — bộ test QUAN TRỌNG NHẤT của hệ thống B2B.
//
// Rò dữ liệu chéo trung tâm = mất toàn bộ uy tín, không chỉ mất một người
// dùng. Nên 5 nhóm test dưới đây là điều kiện bắt buộc trước khi bán:
//
//   1. Cô lập chéo org      — user org A không thấy dữ liệu org B
//   2. Chặn theo vai trò    — student không tạo được lớp
//   3. Phạm vi giáo viên    — GV lớp 1 không thấy HV lớp 2
//   4. Rò rỉ qua ghi        — không INSERT được vào org khác
//   5. Người nhiều tổ chức  — thấy đúng dữ liệu từng org
//
// Test chạy qua ĐÚNG đường người dùng thật đi: anon key + JWT thật.
// Nếu dùng service role thì test bypass RLS và chứng minh được số 0.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  skipReason,
  adminClient,
  createTestUser,
  refreshUser,
  jwtClaims,
  cleanupUsers,
  cleanupOrgs,
} from "../helpers/supabase-test-client.mjs";

const skip = skipReason();

describe("Cô lập tenant (RLS)", { skip: skip ? `Bỏ qua: ${skip}` : false }, () => {
  let orgA, orgB;
  let ownerA, teacherA, studentA, ownerB, studentB, multiOrgUser;
  let classA1, classA2, classB1;
  const admin = adminClient();

  before(async () => {
    // ── Dựng 2 trung tâm độc lập ──
    const stamp = Date.now();
    const { data: a } = await admin
      .from("organizations")
      .insert({ name: "Trung tâm A", slug: `test-a-${stamp}`, status: "active" })
      .select()
      .single();
    const { data: b } = await admin
      .from("organizations")
      .insert({ name: "Trung tâm B", slug: `test-b-${stamp}`, status: "active" })
      .select()
      .single();
    orgA = a;
    orgB = b;
    assert.ok(orgA?.id, "phải tạo được org A");
    assert.ok(orgB?.id, "phải tạo được org B");

    // ── Người dùng ──
    ownerA = await createTestUser("ownerA");
    teacherA = await createTestUser("teacherA");
    studentA = await createTestUser("studentA");
    ownerB = await createTestUser("ownerB");
    studentB = await createTestUser("studentB");
    multiOrgUser = await createTestUser("multi");

    // ── Membership ──
    const { data: memberships } = await admin
      .from("memberships")
      .insert([
        { org_id: orgA.id, user_id: ownerA.id, role: "owner", status: "active" },
        { org_id: orgA.id, user_id: teacherA.id, role: "teacher", status: "active" },
        { org_id: orgA.id, user_id: studentA.id, role: "student", status: "active" },
        { org_id: orgB.id, user_id: ownerB.id, role: "owner", status: "active" },
        { org_id: orgB.id, user_id: studentB.id, role: "student", status: "active" },
        // Người thuộc CẢ HAI org với vai trò khác nhau
        { org_id: orgA.id, user_id: multiOrgUser.id, role: "student", status: "active" },
        { org_id: orgB.id, user_id: multiOrgUser.id, role: "teacher", status: "active" },
      ])
      .select();

    const mid = (userId, orgId) =>
      memberships.find((m) => m.user_id === userId && m.org_id === orgId)?.id;

    // ── Lớp ──
    const { data: classes } = await admin
      .from("classes")
      .insert([
        { org_id: orgA.id, name: "Lớp A1", teacher_membership_id: mid(teacherA.id, orgA.id) },
        { org_id: orgA.id, name: "Lớp A2" },
        { org_id: orgB.id, name: "Lớp B1" },
      ])
      .select();
    classA1 = classes.find((c) => c.name === "Lớp A1");
    classA2 = classes.find((c) => c.name === "Lớp A2");
    classB1 = classes.find((c) => c.name === "Lớp B1");

    // teacherA dạy A1; studentA học A1; studentB học B1
    await admin.from("class_members").insert([
      { class_id: classA1.id, membership_id: mid(teacherA.id, orgA.id), org_id: orgA.id, role_in_class: "teacher" },
      { class_id: classA1.id, membership_id: mid(studentA.id, orgA.id), org_id: orgA.id, role_in_class: "student" },
      { class_id: classB1.id, membership_id: mid(studentB.id, orgB.id), org_id: orgB.id, role_in_class: "student" },
    ]);

    // JWT phải được làm mới để mang claim user_orgs sau khi có membership.
    await Promise.all([
      refreshUser(ownerA), refreshUser(teacherA), refreshUser(studentA),
      refreshUser(ownerB), refreshUser(studentB), refreshUser(multiOrgUser),
    ]);
  });

  after(async () => {
    await cleanupUsers(ownerA, teacherA, studentA, ownerB, studentB, multiOrgUser);
    await cleanupOrgs(orgA?.id, orgB?.id);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Điều kiện tiên quyết: hook phải hoạt động
  // ══════════════════════════════════════════════════════════════════════════

  test("JWT chứa claim user_orgs (hook đã bật)", async () => {
    const claims = await jwtClaims(ownerA);
    assert.ok(claims, "phải đọc được claims");
    assert.ok(
      claims.user_orgs,
      "thiếu claim user_orgs — custom access token hook CHƯA được bật. " +
        "Local: kiểm supabase/config.toml [auth.hook.custom_access_token]. " +
        "Production: Dashboard → Auth → Hooks."
    );
    assert.equal(claims.user_orgs[orgA.id], "owner");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. Cô lập chéo org
  // ══════════════════════════════════════════════════════════════════════════

  test("1a. owner org A KHÔNG thấy org B", async () => {
    const { data } = await ownerA.client.from("organizations").select("id, name");
    const ids = (data || []).map((o) => o.id);
    assert.ok(ids.includes(orgA.id), "phải thấy org của mình");
    assert.ok(!ids.includes(orgB.id), "RÒ RỈ: thấy được org khác");
  });

  test("1b. owner org A KHÔNG thấy lớp của org B", async () => {
    const { data } = await ownerA.client.from("classes").select("id, name, org_id");
    const orgIds = new Set((data || []).map((c) => c.org_id));
    assert.ok(!orgIds.has(orgB.id), "RÒ RỈ: thấy được lớp của org khác");
  });

  test("1c. truy vấn trực tiếp bằng id của org khác vẫn trả rỗng", async () => {
    // Kẻ tấn công biết id org B và thử đọc thẳng
    const { data } = await ownerA.client
      .from("organizations")
      .select("id")
      .eq("id", orgB.id);
    assert.equal((data || []).length, 0, "RÒ RỈ: đọc được org khác khi biết id");
  });

  test("1d. student KHÔNG thấy membership của org khác", async () => {
    const { data } = await studentA.client.from("memberships").select("id, org_id");
    const orgIds = new Set((data || []).map((m) => m.org_id));
    assert.ok(!orgIds.has(orgB.id), "RÒ RỈ: thấy membership org khác");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Chặn theo vai trò
  // ══════════════════════════════════════════════════════════════════════════

  test("2a. student KHÔNG tạo được lớp", async () => {
    const { error } = await studentA.client
      .from("classes")
      .insert({ org_id: orgA.id, name: "Lớp trái phép" })
      .select();
    assert.ok(error, "student phải bị chặn khi tạo lớp");
  });

  test("2b. student KHÔNG mời được thành viên", async () => {
    const { error } = await studentA.client
      .from("memberships")
      .insert({ org_id: orgA.id, invited_email: "ke-la@wordly.test", role: "student", status: "invited" })
      .select();
    assert.ok(error, "student phải bị chặn khi mời thành viên");
  });

  test("2c. teacher KHÔNG xoá được lớp (chỉ owner)", async () => {
    const { error } = await teacherA.client.from("classes").delete().eq("id", classA1.id);
    const { data: still } = await adminClient().from("classes").select("id").eq("id", classA1.id);
    assert.ok(error || (still || []).length === 1, "teacher không được xoá lớp");
  });

  test("2d. owner KHÔNG sửa được org khác", async () => {
    await ownerA.client.from("organizations").update({ name: "Bị chiếm" }).eq("id", orgB.id);
    const { data } = await adminClient().from("organizations").select("name").eq("id", orgB.id).single();
    assert.equal(data.name, "Trung tâm B", "RÒ RỈ: sửa được tên org khác");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Phạm vi giáo viên
  // ══════════════════════════════════════════════════════════════════════════

  test("3a. teacher thấy lớp mình dạy", async () => {
    const { data } = await teacherA.client.from("classes").select("id, name");
    const ids = (data || []).map((c) => c.id);
    assert.ok(ids.includes(classA1.id), "teacher phải thấy lớp mình dạy");
  });

  test("3b. student chỉ thấy lớp mình học, không thấy lớp khác cùng org", async () => {
    const { data } = await studentA.client.from("classes").select("id, name");
    const ids = (data || []).map((c) => c.id);
    assert.ok(ids.includes(classA1.id), "phải thấy lớp mình học");
    assert.ok(!ids.includes(classA2.id), "RÒ RỈ: student thấy lớp mình không học");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Rò rỉ qua đường ghi
  // ══════════════════════════════════════════════════════════════════════════

  test("4a. owner A KHÔNG chèn được lớp vào org B", async () => {
    const { error } = await ownerA.client
      .from("classes")
      .insert({ org_id: orgB.id, name: "Lớp chèn lậu" })
      .select();
    assert.ok(error, "phải bị chặn khi chèn vào org khác");
  });

  test("4b. owner A KHÔNG chèn được membership vào org B", async () => {
    const { error } = await ownerA.client
      .from("memberships")
      .insert({ org_id: orgB.id, invited_email: "lau@wordly.test", role: "owner", status: "invited" })
      .select();
    assert.ok(error, "phải bị chặn khi chèn membership vào org khác");
  });

  test("4c. trigger chặn ghép membership org A vào lớp org B", async () => {
    // Đây là lỗi RLS một mình không bắt được: cả hai hàng đều hợp lệ riêng lẻ.
    const admin2 = adminClient();
    const { data: mA } = await admin2
      .from("memberships")
      .select("id")
      .eq("org_id", orgA.id)
      .eq("user_id", studentA.id)
      .single();

    const { error } = await admin2.from("class_members").insert({
      class_id: classB1.id,        // lớp của org B
      membership_id: mA.id,        // membership của org A
      org_id: orgB.id,
      role_in_class: "student",
    });
    assert.ok(error, "trigger phải chặn việc ghép chéo tenant");
    assert.match(
      error.message,
      /tenant|org/i,
      `thông báo lỗi nên nói rõ vi phạm tenant, nhận được: ${error.message}`
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Người thuộc nhiều tổ chức
  // ══════════════════════════════════════════════════════════════════════════

  test("5a. JWT mang cả hai org với vai trò đúng", async () => {
    const claims = await jwtClaims(multiOrgUser);
    assert.equal(claims.user_orgs[orgA.id], "student", "phải là student ở org A");
    assert.equal(claims.user_orgs[orgB.id], "teacher", "phải là teacher ở org B");
  });

  test("5b. thấy cả hai org, không thấy org thứ ba", async () => {
    const { data } = await multiOrgUser.client.from("organizations").select("id");
    const ids = new Set((data || []).map((o) => o.id));
    assert.ok(ids.has(orgA.id) && ids.has(orgB.id), "phải thấy cả hai org của mình");
    assert.equal(ids.size, 2, "không được thấy org nào khác");
  });

  test("5c. quyền áp đúng theo từng org (student ở A, teacher ở B)", async () => {
    // Ở org A là student → không tạo được lớp
    const { error: errA } = await multiOrgUser.client
      .from("classes")
      .insert({ org_id: orgA.id, name: "Không được phép" })
      .select();
    assert.ok(errA, "là student ở org A thì không được tạo lớp");

    // Ở org B là teacher → tạo được lớp
    const { data: okB, error: errB } = await multiOrgUser.client
      .from("classes")
      .insert({ org_id: orgB.id, name: "Lớp hợp lệ ở B" })
      .select()
      .single();
    assert.ok(!errB, `là teacher ở org B thì phải tạo được lớp, lỗi: ${errB?.message}`);
    assert.ok(okB?.id);

    await adminClient().from("classes").delete().eq("id", okB.id);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Khách (chưa đăng nhập)
  // ══════════════════════════════════════════════════════════════════════════

  test("6a. khách không đọc được bảng nào của tenant", async () => {
    const { guestClient } = await import("../helpers/supabase-test-client.mjs");
    const guest = guestClient();

    for (const table of ["organizations", "memberships", "classes", "class_members"]) {
      const { data } = await guest.from(table).select("*").limit(1);
      assert.equal((data || []).length, 0, `RÒ RỈ: khách đọc được bảng ${table}`);
    }
  });
});
