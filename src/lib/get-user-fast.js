import { headers } from "next/headers";
import { createClient } from "@/lib/supabase-server";

// Returns the authenticated user WITHOUT a network round-trip to Supabase Auth
// when possible. The middleware already validated the session and forwarded the
// user id + email via request headers (x-user-id / x-user-email). We read those
// here instead of calling supabase.auth.getUser() again (which is a network call).
//
// Falls back to supabase.auth.getUser() if the headers are absent (e.g. a route
// hit directly without passing through middleware, or during local edge cases),
// so behaviour is never less correct than before — only faster on the hot path.
//
// Returns { id, email, provider } | null  (same shape the routes actually use)
export async function getUserFast() {
  const h = await headers();
  const id = h.get("x-user-id");
  if (id) {
    return {
      id,
      email: h.get("x-user-email") || null,
      provider: h.get("x-user-provider") || null,
    };
  }

  // Fallback: validate via Supabase (network). Keeps guests/edge cases correct.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email, provider: user.app_metadata?.provider || null } : null;
}
