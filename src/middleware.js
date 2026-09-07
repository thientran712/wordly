import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import { getCachedJwks } from "@/lib/jwks-cache";

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

  // ═══════════════════════════════════════════════════════════════════════
  // PHÁT HIỆN 7/9/2026: getClaims() verify JWT bằng JWKS, nhưng cache JWKS
  // của GoTrueClient chỉ sống trong RAM của 1 instance. Trên Vercel
  // serverless, cold start liên tục làm cache đó gần như luôn miss — MỌI
  // request (middleware chạy ở mọi request) phải gọi mạng tới
  // /.well-known/jwks.json, đo thực tế 150-330ms. Đây là nguyên nhân chính
  // khiến module B2B chậm (mỗi trang gọi 3-5 API song song, mỗi API tự trả
  // giá network này một lần).
  //
  // Sửa: lấy JWKS từ cache Postgres (dùng chung mọi instance, TTL 1 giờ —
  // JWKS gần như không đổi) rồi truyền vào getClaims(jwt, { keys }).
  // getClaims() tự bỏ qua bước fetch mạng khi key cần dùng đã có sẵn
  // trong `keys` — xem GoTrueClient.fetchJwk(). Vẫn dùng ĐÚNG hàm verify
  // của SDK, chỉ tiêm JWKS vào thay vì để nó tự gọi mạng mỗi lần.
  let jwks = null;
  try {
    const admin = createSupabaseJs(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    jwks = await getCachedJwks(admin, `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`);
  } catch (e) {
    // Cache lỗi (DB down, mạng lỗi cả 2 lớp) → jwks=null, getClaims() bên
    // dưới tự fallback về hành vi CŨ (tự gọi mạng). Không làm mất khả năng
    // đăng nhập của người dùng chỉ vì cache tạm thời hỏng.
    console.error("[middleware] lỗi cache JWKS, dùng fallback:", e.message);
  }

  const { data: claimsData, error: authError } = await supabase.auth.getClaims(
    undefined,
    jwks ? { keys: jwks.keys } : undefined
  );
  const claims = claimsData?.claims || null;
  const userId = claims?.sub || null;
  const userEmail = claims?.email || null;
  const userProvider = claims?.app_metadata?.provider || null;

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

  // SECURITY: khớp CHÍNH XÁC, không dùng tiền tố.
  //
  // Trước đây dùng startsWith("/api/translate") nên nó khớp luôn
  // /api/translate-history — một route chứa dữ liệu riêng tư — và
  // startsWith("/api/words") khớp mọi thứ nằm dưới. Các route đó tự kiểm auth
  // nên chưa thành sự cố, nhưng với multi-tenant thì một route lỡ thành public
  // là rò dữ liệu chéo trung tâm. Danh sách tường minh loại bỏ rủi ro đó:
  // thêm route mới sẽ mặc định là PROTECTED, phải khai báo mới thành public.
  const PUBLIC_API_PATHS = new Set([
    "/api/translate",
    "/api/dictionary",
    "/api/words/by-topic",
    "/api/spinner/topics",
    "/api/spinner/interview",
    "/api/spinner/deep-talk",
    "/api/spinner/vocab",
    "/api/spinner/history",
    "/api/spinner/preferences",
    // VNPay gọi 2 route này TRỰC TIẾP (không qua trình duyệt người dùng,
    // không có JWT) — return khi redirect người dùng về, IPN server-to-
    // server. Cả hai tự xác minh chữ ký VNPay trong code, không dựa vào
    // JWT auth của hệ thống.
    "/api/tuition/vnpay-return",
    "/api/tuition/vnpay-ipn",
  ]);
  const isPublicApi = PUBLIC_API_PATHS.has(path);

  const isCronApi = path.startsWith("/api/cron") || path.startsWith("/api/admin");
  const isInngestApi = path.startsWith("/api/inngest");
  const isAuthCallback = path.startsWith("/auth/callback");
  // Public pages: homepage (guest can use translate), auth pages, speaking-practice spinner (guest can try it)
  const isPublicPage = path === "/" || isAuthPage || path.startsWith("/speak");

  // SECURITY: strip any client-supplied auth headers first so a guest can never
  // spoof x-user-id to impersonate another user. We only ever set these from the
  // server-validated JWT below.
  request.headers.delete("x-user-id");
  request.headers.delete("x-user-email");
  request.headers.delete("x-user-provider");

  // Forward the validated user id/email/provider so downstream API routes don't
  // have to call supabase.auth.getUser() again (avoids a second network round-trip).
  if (userId) {
    request.headers.set("x-user-id", userId);
    if (userEmail) request.headers.set("x-user-email", userEmail);
    if (userProvider) request.headers.set("x-user-provider", userProvider);
  }
  // Re-create response so the mutated request headers propagate to the route.
  response = NextResponse.next({ request });

  if (isCronApi || isAuthCallback || isInngestApi) return response;

  // Homepage — guests allowed
  if (path === "/") {
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

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
