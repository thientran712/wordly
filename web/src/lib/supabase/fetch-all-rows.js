// PostgREST cắt mọi request ở db-max-rows (1000 trên production) mà không báo
// lỗi — truy vấn "lấy hết" lặng lẽ trả thiếu. Hàm này lật từng trang bằng
// .range() theo một cột duy nhất (mặc định "id") cho tới khi trang cuối ngắn hơn.
//
// `buildQuery` phải tạo truy vấn MỚI mỗi lần gọi (builder của supabase-js dùng
// một lần là hết). Lỗi ở trang nào thì ném ra — trả thiếu còn tệ hơn báo lỗi.
export async function fetchAllRows(buildQuery, { pageSize = 1000, orderBy = "id" } = {}) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().order(orderBy).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}
