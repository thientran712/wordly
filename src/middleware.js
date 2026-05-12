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
  const isAuthPage = path === "/login" || path === "/signup";
  const isPublicApi = path.startsWith("/api/words");
  const isCronApi = path.startsWith("/api/cron");
  const isOnboardingPage = path === "/onboarding";

  // Cron endpoints không cần auth
  if (isCronApi) {
    return response;
  }

  // Chưa login + trang cần auth → login
  if (!user && !isAuthPage && !isPublicApi) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Đã login + trang login/signup → home
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // User đã login → check onboarding status
  if (user && !isAuthPage && !isPublicApi && !isOnboardingPage) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .single();
    
    // Nếu chưa onboard → redirect onboarding
    if (!profile?.onboarded_at) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }
  
  // User đã onboard mà vào /onboarding → redirect home
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
