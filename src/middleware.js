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

  // getClaims() verifies the JWT locally (no network round-trip) when the project
  // uses asymmetric signing keys; it transparently falls back to a getUser() network
  // call for legacy HS256 secrets, so it's never less correct than getUser().
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims || null;
  const userId = claims?.sub || null;
  const userEmail = claims?.email || null;

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

  // SECURITY: strip any client-supplied auth headers first so a guest can never
  // spoof x-user-id to impersonate another user. We only ever set these from the
  // server-validated JWT below.
  request.headers.delete("x-user-id");
  request.headers.delete("x-user-email");

  // Forward the validated user id/email so downstream API routes don't have to
  // call supabase.auth.getUser() again (avoids a second network round-trip).
  if (userId) {
    request.headers.set("x-user-id", userId);
    if (userEmail) request.headers.set("x-user-email", userEmail);
  }
  // Re-create response so the mutated request headers propagate to the route.
  response = NextResponse.next({ request });

  if (isCronApi || isAuthCallback || isInngestApi) return response;

  // Helper: fetch onboarded_at once (only when actually needed).
  const checkOnboarded = async () => {
    const { data: profile } = await supabase
      .from("profiles").select("onboarded_at").eq("id", userId).single();
    return !!profile?.onboarded_at;
  };

  // Homepage — guests allowed, but logged-in users must be onboarded
  if (path === "/") {
    if (userId && !(await checkOnboarded())) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    return response;
  }

  // Auth pages — redirect logged-in users to home
  if (userId && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Protected API routes — 401 for guests
  if (!userId && isApi && !isPublicApi) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Protected pages — redirect guests to login
  if (!userId && !isAuthPage && !isPublicPage && !isApi) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Logged-in users on protected pages must be onboarded
  if (userId && !isAuthPage && !isApi && !isOnboardingPage && !isPublicPage) {
    if (!(await checkOnboarded())) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  // Onboarding page — redirect already-onboarded users
  if (userId && isOnboardingPage) {
    if (await checkOnboarded()) {
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
