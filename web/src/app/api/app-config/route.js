// Cấu hình app công khai (spec 2026-10-16 §3, §8): app hỏi min_build lúc mở —
// build thấp hơn → màn "Cập nhật Wordly" chặn cả app. Công khai vì có thể hỏi
// trước khi đăng nhập (PUBLIC_API_PATHS trong middleware).
import { appConfigBody } from "@/lib/billing/status";

export const dynamic = "force-dynamic"; // đọc env lúc chạy, không đóng băng lúc build

export function GET() {
  return Response.json(appConfigBody(), { headers: { "Cache-Control": "no-store" } });
}
