import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { scheduleAllSlots, sendSlotEmail } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scheduleAllSlots, sendSlotEmail],
});
