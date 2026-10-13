// Nội dung /api/health — deploy blue/green (infra/vps/web/swap.sh) chỉ chuyển
// nginx sang container mới khi nó trả đúng commit vừa build.
export function healthPayload(env = process.env) {
  return { ok: true, sha: env.GIT_SHA || "unknown" };
}
