-- spinner_preferences / spinner_history đã bật RLS nhưng chưa có policy nào
-- → chỉ service role đọc/ghi được, nên route /api/spinner/* phải dùng
-- createAdminClient() cho request của người dùng (trái quy tắc #5). Thêm
-- policy "của mình" để route chuyển sang anon key + JWT (createClient).
-- Không đổi dữ liệu; service role vẫn bỏ qua RLS như cũ.
--
-- (select auth.uid()) thay vì auth.uid(): Postgres tính một lần cho cả câu
-- truy vấn thay vì mỗi dòng. user_id là khoá chính (preferences) / đầu của
-- index spinner_history_user_type (history) nên lọc theo policy dùng index.

DROP POLICY IF EXISTS spinner_preferences_own ON public.spinner_preferences;
CREATE POLICY spinner_preferences_own ON public.spinner_preferences
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Lịch sử quay: thêm / xem / xoá. Không có UPDATE (route không sửa dòng cũ).
DROP POLICY IF EXISTS spinner_history_select_own ON public.spinner_history;
CREATE POLICY spinner_history_select_own ON public.spinner_history
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS spinner_history_insert_own ON public.spinner_history;
CREATE POLICY spinner_history_insert_own ON public.spinner_history
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS spinner_history_delete_own ON public.spinner_history;
CREATE POLICY spinner_history_delete_own ON public.spinner_history
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);
