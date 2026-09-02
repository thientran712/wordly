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
