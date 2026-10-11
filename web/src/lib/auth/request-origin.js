// Sau nginx (self-host VPS), request.url phản ánh host nội bộ mà Next.js thấy
// (vd. hostname container), không phải domain thật — ưu tiên
// X-Forwarded-Host/-Proto do nginx gắn.
export function requestOrigin(request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin;
}
