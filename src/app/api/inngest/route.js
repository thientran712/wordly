import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { scheduleAllSlots, sendSlotEmail, watchdogReschedule } from "@/inngest/functions";
import {
  computeProgressSnapshots,
  cleanupOrphanedFiles,
  syncStorageLimits,
  deliverAssignment,
  sendParentReports,
  cleanupExpiredSpeakingAudio,
  cleanupRateLimitCounters,
} from "@/inngest/org-functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Email (B2C + B2B)
    scheduleAllSlots,
    sendSlotEmail,
    watchdogReschedule,
    // B2B
    computeProgressSnapshots,
    cleanupOrphanedFiles,
    syncStorageLimits,
    deliverAssignment,
    sendParentReports,
    cleanupExpiredSpeakingAudio,
    cleanupRateLimitCounters,
  ],
});
