import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { bearerToForward } from "@/lib/auth/bearer-auth";

/**
 * Bearer token của request hiện tại (app iOS), hoặc null nếu request dùng
 * cookie session / là khách. Cookie luôn thắng — xem bearer-auth.js.
 */
export async function currentBearerToken() {
  const cookieStore = await cookies();
  return bearerToForward({
    cookieNames: cookieStore.getAll().map((c) => c.name),
    authorizationHeader: (await headers()).get("authorization"),
  });
}

export async function createClient() {
  const cookieStore = await cookies();

  // Request từ app iOS (Bearer, không cookie): chuyển token xuống PostgREST
  // để RLS chạy đúng người dùng. Không có token thì giữ nguyên hành vi cookie.
  const bearerToken = await currentBearerToken();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component cannot set cookies
          }
        },
      },
      ...(bearerToken && {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      }),
    }
  );
}
