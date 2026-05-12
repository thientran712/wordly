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

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/login" || path === "/signup" || 
                     path === "/forgot-password" || path === "/reset-password";
  const isApi = path.startsWith("/api/");
  const isPublicApi = path.startsWith("/api/words");
  const isCronApi = path.startsWith("/api/cron");
  const isAuthCallback = path.startsWith("/auth/callback");
  const isOnboardingPage = path === "/onboarding";

  // Cron + auth callback không cần check
  if (isCronApi || isAuthCallback) {
    return response;
  }

  // Chưa login + page cần auth → redirect login
  if (!user && !isAuthPage && !isPublicApi && !isApi) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // API routes: nếu chưa login, trả 401 (không redirect)
  if (!user && isApi && !isPublicApi) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Đã login + trang login/signup → home
  if (user && (path === "/login" || path === "/signup" || path === "/forgot-password")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // CHỈ check onboarding cho PAGE routes, KHÔNG cho API routes
  if (user && !isAuthPage && !isPublicApi && !isApi && !isOnboardingPage) {
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
