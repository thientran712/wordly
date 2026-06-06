import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError?.code === "refresh_token_not_found" || authError?.message?.includes("Refresh Token")) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    request.cookies.getAll().forEach(cookie => {
      if (cookie.name.startsWith("sb-")) res.cookies.delete(cookie.name);
    });
    return res;
  }

  const path = request.nextUrl.pathname;
  const isAuthPage = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(path);
  const isApi = path.startsWith("/api/");
  const isPublicApi = path.startsWith("/api/words") || path.startsWith("/api/translate");
  const isCronApi = path.startsWith("/api/cron") || path.startsWith("/api/admin");
  const isInngestApi = path.startsWith("/api/inngest");
  const isAuthCallback = path.startsWith("/auth/callback");
  const isOnboardingPage = path === "/onboarding";
  // Public pages: homepage (guest can use translate), auth pages
  const isPublicPage = path === "/" || isAuthPage;

  if (isCronApi || isAuthCallback || isInngestApi) return response;

  // Homepage — guests allowed, but logged-in users must be onboarded
  if (path === "/") {
    if (user) {
      const { data: profile } = await supabase
        .from("profiles").select("onboarded_at").eq("id", user.id).single();
      if (!profile?.onboarded_at) {
        return NextResponse.redirect(new URL("/onboarding", request.url));
      }
    }
    return response;
  }

  // Auth pages — redirect logged-in users to home
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Protected API routes — 401 for guests
  if (!user && isApi && !isPublicApi) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Protected pages — redirect guests to login
  if (!user && !isAuthPage && !isPublicPage && !isApi) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Logged-in users on protected pages must be onboarded
  if (user && !isAuthPage && !isApi && !isOnboardingPage && !isPublicPage) {
    const { data: profile } = await supabase
      .from("profiles").select("onboarded_at").eq("id", user.id).single();
    if (!profile?.onboarded_at) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  // Onboarding page — redirect already-onboarded users
  if (user && isOnboardingPage) {
    const { data: profile } = await supabase
      .from("profiles").select("onboarded_at").eq("id", user.id).single();
    if (profile?.onboarded_at) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
