import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { cleanupRateLimitCounters } from "@/inngest/functions";

// Email nhắc học đã chuyển sang cron VPS (xem src/inngest/functions.js) —
// Inngest giờ chỉ còn dọn bộ đếm rate-limit.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [cleanupRateLimitCounters],
});
