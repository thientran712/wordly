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

// ── Báo cáo phụ huynh định kỳ (GĐ3) ────────────────────────────────────────
//
// Gửi mỗi Chủ nhật 01:00 UTC (08:00 giờ VN thứ Hai là quá muộn cho báo cáo
// tuần; sáng CN phụ huynh có thời gian đọc).
//
// Chỉ gửi SỐ LIỆU tiến độ — không có nội dung học tập cá nhân. Cùng nguyên
// tắc quyền riêng tư như dashboard giáo viên.
//
// Bật/tắt theo feature flag `parent_reports` nên trung tâm gói Basic không
// bị gửi email ngoài gói.
export const sendParentReports = inngest.createFunction(
  {
    id: "send-parent-reports",
    triggers: [
      { cron: "0 1 * * 0" },            // CN 01:00 UTC
      { event: "org/parent-reports.run" }, // kích hoạt tay để thử
    ],
    retries: 1,
  },
  async ({ event, step }) => {
    const orgs = await step.run("load-orgs", async () => {
      const supabase = createAdminClient();
      const { isFeatureEnabled } = await import("@/lib/org-settings");

      let query = supabase
        .from("organizations")
        .select("id, name")
        .in("status", ["trial", "active"]);

      if (event?.data?.org_id) query = query.eq("id", event.data.org_id);

      const { data } = await query;

      // Lọc theo feature flag — trung tâm chưa mua gói có báo cáo thì bỏ qua
      const enabled = [];
      for (const org of data || []) {
        if (await isFeatureEnabled(org.id, "parent_reports")) enabled.push(org);
      }
      return enabled;
    });

    if (orgs.length === 0) return { orgs: 0, sent: 0 };

    let sent = 0;
    let skipped = 0;

    for (const org of orgs) {
      const result = await step.run(`report-${org.id}`, async () => {
        const supabase = createAdminClient();

        // Chỉ lấy HỌC VIÊN; người nhận báo cáo được phân giải qua
        // guardian_links (phụ huynh) — xem resolveReportRecipients().
        const { data: members } = await supabase
          .from("memberships")
          .select("id, user_id, invited_email")
          .eq("org_id", org.id)
          .eq("status", "active")
          .eq("role", "student");

        if (!members?.length) return { sent: 0, skipped: 0 };

        // Snapshot mới nhất trong 7 ngày
        const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
        const membershipIds = members.map((m) => m.id);

        const { data: snapshots } = await supabase
          .from("student_progress_snapshots")
          .select("membership_id, snapshot_date, words_saved, streak_days, last_active_at")
          .in("membership_id", membershipIds)
          .gte("snapshot_date", since)
          .order("snapshot_date", { ascending: false });

        const latest = new Map();
        const activeDays = new Map();
        for (const s of snapshots || []) {
          if (!latest.has(s.membership_id)) latest.set(s.membership_id, s);
          // Đếm số ngày có hoạt động trong tuần
          if (s.last_active_at) {
            const set = activeDays.get(s.membership_id) || new Set();
            set.add(s.last_active_at.slice(0, 10));
            activeDays.set(s.membership_id, set);
          }
        }

        const { sendParentReportEmail } = await import("@/lib/send-org-email");
        const { getOrgSettings } = await import("@/lib/org-settings");
        const { resolveReportRecipients } = await import("@/lib/guardian-links");
        const settings = await getOrgSettings(org.id);

        // ── Người nhận báo cáo: qua guardian_links ──
        // Một phụ huynh theo nhiều con, một học viên có thể có cả bố lẫn mẹ.
        const { data: links } = await supabase
          .from("guardian_links")
          .select("student_membership_id, guardian_membership_id, receive_reports")
          .eq("org_id", org.id)
          .eq("receive_reports", true);

        // Tra email của phụ huynh (một lượt, không N+1)
        const guardianIds = [...new Set((links || []).map((l) => l.guardian_membership_id))];
        const guardianEmail = new Map();
        if (guardianIds.length > 0) {
          const { data: gm } = await supabase
            .from("memberships")
            .select("id, user_id, invited_email")
            .in("id", guardianIds);
          for (const g of gm || []) {
            let e = g.invited_email;
            if (!e && g.user_id) {
              const { data: au } = await supabase.auth.admin.getUserById(g.user_id);
              e = au?.user?.email || null;
            }
            if (e) guardianEmail.set(g.id, e);
          }
        }

        const linksWithEmail = (links || []).map((l) => ({
          ...l,
          email: guardianEmail.get(l.guardian_membership_id) || null,
        }));

        // ── Quiz stats 7 ngày để đưa vào báo cáo ──
        const sinceIso = new Date(Date.now() - 7 * 86400_000).toISOString();
        const { data: quizzes } = await supabase
          .from("quiz_attempts")
          .select("membership_id, correct, total")
          .eq("org_id", org.id)
          .gte("created_at", sinceIso);

        const quizByMember = new Map();
        for (const q of quizzes || []) {
          if (!q.membership_id) continue;
          const cur = quizByMember.get(q.membership_id) || { attempts: 0, correct: 0, total: 0 };
          cur.attempts += 1;
          cur.correct += Number(q.correct) || 0;
          cur.total += Number(q.total) || 0;
          quizByMember.set(q.membership_id, cur);
        }

        // ── Bài tập: đã nộp / tổng số được giao ──
        const { data: hwSubs } = await supabase
          .from("homework_submissions")
          .select("membership_id, status")
          .eq("org_id", org.id)
          .in("status", ["submitted", "graded"]);

        const hwByMember = new Map();
        for (const h of hwSubs || []) {
          hwByMember.set(h.membership_id, (hwByMember.get(h.membership_id) || 0) + 1);
        }

        let localSent = 0;
        let localSkipped = 0;

        for (const m of members) {
          const snap = latest.get(m.id);
          // Không có số liệu thì không gửi email rỗng — vô nghĩa với phụ huynh
          if (!snap) {
            localSkipped++;
            continue;
          }

          // Email của chính học viên (dùng khi không có phụ huynh nào)
          let ownEmail = m.invited_email;
          if (!ownEmail && m.user_id) {
            const { data: authUser } = await supabase.auth.admin.getUserById(m.user_id);
            ownEmail = authUser?.user?.email || null;
          }

          // Phân giải người nhận — logic có test riêng (guardian-links.test.mjs)
          const { emails, reason } = resolveReportRecipients(
            { membership_id: m.id, email: ownEmail },
            linksWithEmail
          );

          if (emails.length === 0) {
            localSkipped++;
            continue;
          }

          const inactive = snap.last_active_at
            ? Math.floor((Date.now() - new Date(snap.last_active_at).getTime()) / 86400_000)
            : 999;

          const state =
            inactive <= settings.active_threshold_days
              ? "active"
              : inactive <= settings.stalled_threshold_days
              ? "stalled"
              : "dropped";

          const qz = quizByMember.get(m.id);

          const stats = {
            words_saved: snap.words_saved || 0,
            streak_days: snap.streak_days || 0,
            active_days: activeDays.get(m.id)?.size || 0,
            quiz_attempts: qz?.attempts || 0,
            quiz_avg_percent:
              qz && qz.total > 0 ? Math.round((qz.correct / qz.total) * 100) : null,
            homework_submitted: hwByMember.get(m.id) || 0,
            homework_total: hwByMember.get(m.id) || 0,
          };

          // Gửi cho từng người nhận (bố + mẹ có thể là 2 email khác nhau)
          for (const to of emails) {
            const res = await sendParentReportEmail({
              to,
              studentName: m.invited_email?.split("@")[0] || ownEmail?.split("@")[0] || "Học viên",
              className: "",
              orgName: org.name,
              periodLabel: "7 ngày qua",
              state,
              stats,
            });
            if (res.success) localSent++;
            else localSkipped++;
          }

          // reason='self' nghĩa là học viên chưa được gán phụ huynh nào —
          // hữu ích khi cần rà soát dữ liệu trung tâm.
          if (reason === "self") {
            console.log(`[parent-reports] HV ${m.id} chưa có phụ huynh, gửi cho chính HV`);
          }
        }

        return { sent: localSent, skipped: localSkipped };
      });

      sent += result.sent;
      skipped += result.skipped;
    }

    return { orgs: orgs.length, sent, skipped };
  }
);

// ── Dọn audio bài nói hết hạn ───────────────────────────────────────────────
//
// Audio bài nói đã chấm quá 90 ngày sẽ bị xoá, GIỮ LẠI điểm và nhận xét.
// Không có cơ chế này thì dung lượng phình vô hạn theo thời gian — mỗi khoá
// học mới lại cộng thêm, không bao giờ giảm.
//
// Trigger track_speaking_storage tự trả lại quota khi audio_deleted=true.
export const cleanupExpiredSpeakingAudio = inngest.createFunction(
  {
    id: "cleanup-expired-speaking-audio",
    triggers: [{ cron: "30 3 * * *" }], // 03:30 UTC hằng ngày
    retries: 1,
  },
  async ({ step }) => {
    const expired = await step.run("find-expired", async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("speaking_submissions")
        .select("id, org_id, storage_path")
        .eq("audio_deleted", false)
        .not("audio_expires_at", "is", null)
        .lt("audio_expires_at", new Date().toISOString())
        .limit(500); // xử lý theo lô, tránh job chạy quá lâu

      if (error) throw new Error(`Không tìm được bài hết hạn: ${error.message}`);
      return data || [];
    });

    if (expired.length === 0) return { deleted: 0 };

    const deleted = await step.run("delete-audio", async () => {
      const supabase = createAdminClient();
      let count = 0;

      // Xoá blob theo lô 100 file
      for (let i = 0; i < expired.length; i += 100) {
        const batch = expired.slice(i, i + 100);
        const paths = batch.map((r) => r.storage_path).filter(Boolean);

        if (paths.length > 0) {
          const { error: rmErr } = await supabase.storage
            .from("speaking-submissions")
            .remove(paths);
          // Blob có thể đã bị xoá tay trước đó — vẫn đánh dấu để không quét lại
          if (rmErr) {
            console.error("[speaking-cleanup] xoá blob lỗi:", rmErr.message);
          }
        }

        // Đánh dấu SAU khi xoá blob. Nếu đánh dấu trước mà xoá lỗi thì blob
        // thành rác vĩnh viễn (không còn ai quét tới nó nữa).
        const { error: updErr } = await supabase
          .from("speaking_submissions")
          .update({ audio_deleted: true })
          .in("id", batch.map((r) => r.id));

        if (updErr) {
          console.error("[speaking-cleanup] đánh dấu lỗi:", updErr.message);
        } else {
          count += batch.length;
        }
      }
      return count;
    });

    return { found: expired.length, deleted };
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
