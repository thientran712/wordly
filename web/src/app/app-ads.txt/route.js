// app-ads.txt (spec 2026-10-23): AdMob đọc file này trên tên miền khai ở App
// Store (trang hỗ trợ) để xác nhận app thuộc tài khoản AdMob của mình.
import { appAdsTxt } from "@/lib/ads/config";

export function GET() {
  const body = appAdsTxt();
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
