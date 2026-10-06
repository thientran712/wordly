// Bọc supabase.auth.getClaims() để KHÔNG BAO GIỜ throw.
//
// getClaims() ném exception (thay vì trả { error }) với JWT thiếu claim `exp`
// hoặc header rác. Middleware không bắt → MIDDLEWARE_INVOCATION_FAILED (500)
// cho mọi request mang token đó — ai cũng gửi được qua header Bearer hoặc
// cookie. Lỗi kiểu này phải được coi là "chưa đăng nhập".
export async function getClaimsSafely(auth, jwt, options) {
  try {
    return await auth.getClaims(jwt, options);
  } catch (error) {
    return { data: null, error };
  }
}
