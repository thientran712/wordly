import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";

// The `words` table is effectively static reference data. Fetching all of it on
// every /api/words and /api/words/next request is wasteful. Cache the raw rows
// for 1 hour using the admin client (no cookies → safe inside a cache scope).
//
// Callers still do their own shuffling / filtering on the cached array, so the
// per-request behaviour (random word selection) is unchanged — only the DB read
// is cached.
export const getAllWordsCached = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const { data } = await admin.from("words").select("*");
    return data || [];
  },
  ["all-words-v1"],
  { revalidate: 3600, tags: ["words"] }
);
