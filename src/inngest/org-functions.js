// Inngest jobs cho phần B2B.
//
// Tách file riêng khỏi functions.js (đang lo email) để hai mảng nghiệp vụ
// không dính vào nhau — functions.js đã 362 dòng và là phần dễ vỡ nhất
// của hệ thống.

import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase-admin";

// ── Snapshot tiến độ hằng ngày ──────────────────────────────────────────────
//
// Tính trước số liệu cho dashboard giáo viên. Chạy trong DB (hàm
// compute_org_progress_snapshots) thay vì kéo dữ liệu về Node, vì:
//   1. Dữ liệu học tập nằm ngay trong Postgres — kéo về rồi tính lại là vô ích
//   2. Tránh việc job đọc nội dung học tập cá nhân ra khỏi database
//
// Chạy 02:00 UTC = 09:00 giờ VN, sau khi hoạt động trong ngày đã lắng.
export const computeProgressSnapshots = inngest.createFunction(
  {
    id: "compute-progress-snapshots",
    triggers: [{ cron: "0 2 * * *" }],
    retries: 2,
  },
  async ({ step }) => {
    const orgs = await step.run("load-active-orgs", async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .in("status", ["trial", "active"]);
      if (error) throw new Error(`Không tải được danh sách org: ${error.message}`);
      return data || [];
    });

    if (orgs.length === 0) return { orgs: 0, snapshots: 0 };

    // Mỗi org một step: một org lỗi không làm hỏng cả job, và Inghest chỉ
    // retry đúng step bị lỗi thay vì tính lại toàn bộ.
    let total = 0;
    const failures = [];

    for (const org of orgs) {
      const result = await step.run(`snapshot-${org.id}`, async () => {
        const supabase = createAdminClient();
        const { data, error } = await supabase.rpc("compute_org_progress_snapshots", {
          p_org_id: org.id,
        });
        if (error) {
          // Trả về lỗi thay vì throw: một trung tâm lỗi không nên chặn
          // dashboard của các trung tâm còn lại.
          console.error(`[snapshots] org ${org.id} lỗi:`, error.message);
          return { ok: false, error: error.message, count: 0 };
        }
        return { ok: true, count: data ?? 0 };
      });

      if (result.ok) total += result.count;
      else failures.push({ org_id: org.id, error: result.error });
    }

    return { orgs: orgs.length, snapshots: total, failures };
  }
);

// ── Dọn rác Storage ─────────────────────────────────────────────────────────
//
// Đối chiếu file trên Storage với hàng trong lesson_materials. File không còn
// hàng nào trỏ tới là rác — vẫn bị tính tiền nhưng không ai dùng.
//
// Vì sao cần: xoá hàng DB mà blob còn lại là rò rỉ chi phí âm thầm. Trigger
// đã trừ quota khi xoá hàng, nên nếu không dọn blob thì bytes_used sẽ nhỏ hơn
// dung lượng thật và org dùng vượt hạn mức mà hệ thống không biết.
export const cleanupOrphanedFiles = inngest.createFunction(
  {
    id: "cleanup-orphaned-files",
    triggers: [{ cron: "0 3 * * 0" }], // 03:00 UTC Chủ nhật
    retries: 1,
  },
  async ({ step }) => {
    const orgs = await step.run("load-orgs", async () => {
      const supabase = createAdminClient();
      const { data } = await supabase.from("organizations").select("id");
      return data || [];
    });

    let removed = 0;

    for (const org of orgs) {
      const result = await step.run(`cleanup-${org.id}`, async () => {
        const supabase = createAdminClient();

        // Đường dẫn file có dạng {org_id}/{class_id}/{session_id}/{file},
        // mà Storage list() KHÔNG đệ quy — nó chỉ trả về một mức. Phải tự đi
        // xuống từng mức, nếu không sẽ bỏ sót gần như toàn bộ file thật và
        // job trông như "không có rác" trong khi rác vẫn bị tính tiền.
        const listAllFiles = async (prefix, depth = 0) => {
          if (depth > 3) return []; // org/class/session/file — không sâu hơn
          const { data: entries, error } = await supabase.storage
            .from("lesson-materials")
            .list(prefix, { limit: 1000 });
          if (error || !entries?.length) return [];

          const out = [];
          for (const entry of entries) {
            const path = `${prefix}/${entry.name}`;
            // Supabase đánh dấu file thật bằng `id`; mục không có id là "thư mục".
            if (entry.id) out.push(path);
            else out.push(...(await listAllFiles(path, depth + 1)));
          }
          return out;
        };

        const allFiles = await listAllFiles(org.id);
        if (allFiles.length === 0) return { removed: 0 };

        // Các đường dẫn đang được tham chiếu trong DB
        const { data: rows, error: rowsErr } = await supabase
          .from("lesson_materials")
          .select("storage_path")
          .eq("org_id", org.id)
          .not("storage_path", "is", null);

        // Nếu không đọc được DB thì TUYỆT ĐỐI không xoá gì — thà giữ rác còn
        // hơn xoá mất tài liệu thật của khách hàng.
        if (rowsErr) {
          console.error(`[cleanup] org ${org.id} không đọc được DB, bỏ qua:`, rowsErr.message);
          return { removed: 0 };
        }

        const referenced = new Set((rows || []).map((r) => r.storage_path));
        const orphans = allFiles.filter((p) => !referenced.has(p));

        if (orphans.length === 0) return { removed: 0 };

        const { error: rmErr } = await supabase.storage
          .from("lesson-materials")
          .remove(orphans);

        if (rmErr) {
          console.error(`[cleanup] org ${org.id} xoá lỗi:`, rmErr.message);
          return { removed: 0 };
        }
        return { removed: orphans.length };
      });

      removed += result.removed;
    }

    return { orgs: orgs.length, files_removed: removed };
  }
);

// ── Nạp bộ từ được giao vào hàng đợi học viên ───────────────────────────────
//
// Đây là chỗ B2B nối vào động cơ FSRS + email đã có: từ được giao được ghi
// vào translate_history với is_saved=true, state='new'. Từ đó
// select-word-for-email.js tự lo phần còn lại — học viên nhận qua email và
// thấy trong app bằng đúng cơ chế hiện có, không cần code phân phối mới.
//
// Chạy khi giáo viên giao bài, VÀ chạy lại hằng ngày để nạp cho học viên mới
// vào lớp sau khi bài đã giao.
export const deliverAssignment = inngest.createFunction(
  {
    id: "deliver-assignment",
    triggers: [
      { event: "assignment/created" },
      // Đồng bộ hằng ngày: bắt học viên mới vào lớp muộn
      { cron: "0 1 * * *" },
    ],
    retries: 2,
  },
  async ({ event, step }) => {
    // Chạy theo event thì chỉ xử lý một bài; chạy theo cron thì quét tất cả
    // bài đang trong thời hạn.
    const assignmentIds = await step.run("resolve-assignments", async () => {
      const supabase = createAdminClient();

      if (event?.data?.assignment_id) {
        return [event.data.assignment_id];
      }

      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("class_assignments")
        .select("id")
        .lte("start_date", today)
        .or(`end_date.is.null,end_date.gte.${today}`);
      return (data || []).map((a) => a.id);
    });

    if (assignmentIds.length === 0) return { assignments: 0, delivered: 0 };

    let delivered = 0;

    for (const assignmentId of assignmentIds) {
      const result = await step.run(`deliver-${assignmentId}`, async () => {
        const supabase = createAdminClient();

        const { data: assignment } = await supabase
          .from("class_assignments")
          .select("id, class_id, org_id, filter_level, filter_topic, explicit_word_ids, daily_count")
          .eq("id", assignmentId)
          .maybeSingle();

        if (!assignment) return { delivered: 0 };

        // ── Chọn từ theo tiêu chí ──
        // Lưu tiêu chí (không phải danh sách cố định) nên học viên vào muộn
        // vẫn nhận đúng bộ từ, và GV sửa tiêu chí là cả lớp cập nhật theo.
        let words = [];

        if (assignment.explicit_word_ids?.length > 0) {
          const { data } = await supabase
            .from("words")
            .select("id, word, def_vi, def_en")
            .in("id", assignment.explicit_word_ids);
          words = data || [];
        } else {
          let query = supabase.from("words").select("id, word, def_vi, def_en");

          if (assignment.filter_level) {
            query = query.eq("level", assignment.filter_level);
          }
          if (assignment.filter_topic) {
            // Chủ đề nằm ở word_layers — lấy word_id trước rồi lọc.
            const { data: layers } = await supabase
              .from("word_layers")
              .select("word_id")
              .eq("topic", assignment.filter_topic)
              .limit(500);
            const ids = (layers || []).map((l) => l.word_id);
            if (ids.length === 0) return { delivered: 0 };
            query = query.in("id", ids);
          }

          // Giới hạn số từ theo daily_count × 30 ngày — không nạp cả 7.5k từ
          // vào hàng đợi của một học viên.
          const { data } = await query.limit(assignment.daily_count * 30);
          words = data || [];
        }

        if (words.length === 0) return { delivered: 0 };

        // ── Học viên trong lớp ──
        const { data: members } = await supabase
          .from("class_members")
          .select("membership_id, memberships!inner(id, user_id, status)")
          .eq("class_id", assignment.class_id)
          .eq("role_in_class", "student");

        const students = (members || [])
          .filter((m) => m.memberships?.user_id && m.memberships.status === "active")
          .map((m) => ({ membership_id: m.membership_id, user_id: m.memberships.user_id }));

        if (students.length === 0) return { delivered: 0 };

        // ── Bỏ những từ đã nạp rồi (idempotency) ──
        // Job này chạy hằng ngày nên phải chống nạp trùng, nếu không hàng đợi
        // của học viên sẽ phình lên mỗi ngày.
        const { data: alreadyDelivered } = await supabase
          .from("assignment_deliveries")
          .select("membership_id, word_id")
          .eq("assignment_id", assignment.id);

        const deliveredSet = new Set(
          (alreadyDelivered || []).map((d) => `${d.membership_id}:${d.word_id}`)
        );

        const historyRows = [];
        const deliveryRows = [];
        const now = new Date().toISOString();

        for (const student of students) {
          for (const word of words) {
            const key = `${student.membership_id}:${word.id}`;
            if (deliveredSet.has(key)) continue;

            historyRows.push({
              user_id: student.user_id,
              source_text: word.word,
              translated_text: word.def_vi || word.def_en || word.word,
              direction: "EN→VI",
              // is_saved=true để từ này vào hàng đợi email (xem
              // select-word-for-email.js: chỉ lấy từ đã lưu)
              is_saved: true,
              saved_at: now,
              state: "new",
            });

            deliveryRows.push({
              assignment_id: assignment.id,
              membership_id: student.membership_id,
              word_id: word.id,
            });
          }
        }

        if (historyRows.length === 0) return { delivered: 0 };

        // Chèn theo lô để không vượt giới hạn payload.
        const BATCH = 500;
        for (let i = 0; i < historyRows.length; i += BATCH) {
          const { error } = await supabase
            .from("translate_history")
            .insert(historyRows.slice(i, i + BATCH));
          if (error) {
            throw new Error(`Nạp từ thất bại: ${error.message}`);
          }
        }

        // Ghi nhận đã nạp SAU khi chèn thành công — nếu ghi trước mà chèn
        // lỗi thì lần sau sẽ tưởng đã nạp và bỏ qua vĩnh viễn.
        for (let i = 0; i < deliveryRows.length; i += BATCH) {
          await supabase
            .from("assignment_deliveries")
            .insert(deliveryRows.slice(i, i + BATCH));
        }

        return { delivered: historyRows.length };
      });

      delivered += result.delivered;
    }

    return { assignments: assignmentIds.length, delivered };
  }
);

// ── Đồng bộ quota theo gói ──────────────────────────────────────────────────
// Khi org đổi gói, hạn mức lưu trữ phải đổi theo. Chạy hằng ngày để bắt cả
// trường hợp đổi gói bằng tay trên dashboard.
export const syncStorageLimits = inngest.createFunction(
  {
    id: "sync-storage-limits",
    triggers: [{ cron: "30 2 * * *" }],
  },
  async ({ step }) => {
    const updated = await step.run("sync", async () => {
      const supabase = createAdminClient();
      const { PLAN_STORAGE_LIMITS } = await import("@/lib/org-settings");

      const { data: orgs } = await supabase.from("organizations").select("id, plan");
      if (!orgs?.length) return 0;

      let count = 0;
      for (const org of orgs) {
        const limit = PLAN_STORAGE_LIMITS[org.plan] ?? PLAN_STORAGE_LIMITS.basic;
        const { error } = await supabase
          .from("org_storage_usage")
          .upsert(
            { org_id: org.id, bytes_limit: limit },
            { onConflict: "org_id", ignoreDuplicates: false }
          );
        if (!error) count++;
      }
      return count;
    });

    return { synced: updated };
  }
);
