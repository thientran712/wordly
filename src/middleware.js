import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => 
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // Stale/invalid token — clear cookies and redirect to login
  if (authError?.code === "refresh_token_not_found" || authError?.message?.includes("Refresh Token")) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    request.cookies.getAll().forEach(cookie => {
      if (cookie.name.startsWith("sb-")) res.cookies.delete(cookie.name);
    });
    return res;
  }

  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/login" || path === "/signup" || 
                     path === "/forgot-password" || path === "/reset-password";
  const isApi = path.startsWith("/api/");
  const isPublicApi = path.startsWith("/api/words");
  const isCronApi = path.startsWith("/api/cron") || path.startsWith("/api/admin");
  const isInngestApi = path.startsWith("/api/inngest");
  const isAuthCallback = path.startsWith("/auth/callback");
  const isOnboardingPage = path === "/onboarding";
  const isLandingPage = path === "/";
  // Public routes - no auth check
  const isPublicPage = isLandingPage;

  if (isCronApi || isAuthCallback || isInngestApi) {
    return response;
  }

  // Trang chủ (/) — phải login + đã onboarded
  if (isPublicPage) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .single();
    if (!profile?.onboarded_at) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    return response;
  }

  if (!user && !isAuthPage && !isPublicApi && !isApi && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!user && isApi && !isPublicApi) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user && (path === "/login" || path === "/signup" || path === "/forgot-password")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (user && !isAuthPage && !isPublicApi && !isApi && !isOnboardingPage && !isPublicPage) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .single();

    if (!profile?.onboarded_at) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  if (user && isOnboardingPage) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .single();

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
