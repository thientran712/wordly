// Xoá tài khoản người dùng (Apple Guideline 5.1.1(v) bắt buộc có trong app).
//
// Mọi bảng dữ liệu riêng đều có FK tới auth.users ON DELETE CASCADE, trừ
// email_slots (FK không cascade) — còn dòng nào là xoá user bị chặn, nên xoá
// nó trước bằng client của chính người dùng (RLS). Chỉ bước xoá user mới cần
// service role: auth.admin.deleteUser không có cách nào khác.
export async function deleteAccount({ userId, userClient, adminClient }) {
  if (!userId) return { ok: false, error: "Thiếu người dùng" };

  const { error: slotsError } = await userClient.from("email_slots").delete().eq("user_id", userId);
  if (slotsError) return { ok: false, error: slotsError.message };

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) return { ok: false, error: deleteError.message };

  return { ok: true };
}
