import { healthPayload } from "@/lib/health";

// Công khai (PUBLIC_API_PATHS) — không chạm DB, chỉ báo commit đang chạy.
export function GET() {
  return Response.json(healthPayload());
}
