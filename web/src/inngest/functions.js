import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";

// Lên lịch + gửi email nhắc học trước đây dùng 3 function Inngest ở đây
// (scheduleAllSlots/sendSlotEmail/watchdogReschedule, sleepUntil tới đúng
// giờ mỗi user) — đã THAY bằng cron VPS polling mỗi 5 phút, xem
// src/app/api/cron/send-emails/route.js + src/lib/email/cron-send-emails.js
// (quyết định 10/10/2026: bớt phụ thuộc Inngest khi đã tự host VPS).

// ── Dọn bộ đếm rate limit hết hạn ───────────────────────────────────────────
//
// Mỗi IP mỗi phút sinh một hàng, không dọn thì bảng phình vô hạn.
// Chạy mỗi giờ vì hàng hết hạn rất nhanh (2 khung = 2 phút).
export const cleanupRateLimitCounters = inngest.createFunction(
  {
    id: "cleanup-rate-limit-counters",
    triggers: [{ cron: "15 * * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    return await step.run("cleanup", async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc("cleanup_rate_limit_counters");
      if (error) {
        // Không throw: bảng phình là vấn đề chậm, không phải sự cố tức thì
        console.error("[rate-limit-cleanup] lỗi:", error.message);
        return { deleted: 0, error: error.message };
      }
      return { deleted: data ?? 0 };
    });
  }
);
