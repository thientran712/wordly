// Tham số GET /api/translate-history.
// `saved=1`: chỉ từ đã lưu, cho tới 200 dòng/lần — tab Từ vựng > Đã lưu lấy
// đủ trong 1 lần gọi thay vì lật 4 trang lịch sử rồi tự lọc.
const MAX_LIMIT = 50;
const MAX_SAVED_LIMIT = 200;

export function parseHistoryQuery(searchParams) {
  const savedOnly = searchParams.get("saved") === "1";
  const rawLimit = parseInt(searchParams.get("limit") || "20", 10);
  const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
  const cap = savedOnly ? MAX_SAVED_LIMIT : MAX_LIMIT;
  const limit = Number.isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), cap);
  const offset = Number.isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0);
  return { limit, offset, savedOnly };
}
