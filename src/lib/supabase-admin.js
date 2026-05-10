import { createClient } from "@supabase/supabase-js";

// Admin client - chỉ dùng trong server-side code (cron, internal API)
// KHÔNG BAO GIỜ expose ra browser/client
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
