-- ════════════════════════════════════════════════════════════════════════════
-- GĐ4 — Chấm bài nói (speaking review)
--
-- Học viên ghi âm trả lời một đề nói, giáo viên nghe rồi cho điểm + nhận xét.
--
-- Về chi phí lưu trữ (đã tính toán trước khi thiết kế):
--   audio webm/opus 24kbps × 90 giây ≈ 0.26 MB
--   500 HV × 8 bài/tháng ≈ 1 GB/tháng → nằm trong quota Pro (50GB)
-- Nên KHÔNG cần dịch vụ streaming riêng như video. Dùng Supabase Storage.
--
-- Có `expires_at` + job dọn: audio đã chấm quá 90 ngày sẽ bị xoá, giữ lại
-- điểm và nhận xét. Nếu không, dung lượng phình vô hạn theo thời gian.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'speaking_status') THEN
    CREATE TYPE speaking_status AS ENUM ('submitted', 'graded');
  END IF;
END $$;

-- ── speaking_prompts: đề nói do giáo viên tạo ───────────────────────────────
CREATE TABLE IF NOT EXISTS speaking_prompts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES class_sessions(id) ON DELETE SET NULL,

  title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  prompt_text  TEXT NOT NULL CHECK (length(trim(prompt_text)) BETWEEN 1 AND 2000),
  -- Thời lượng tối đa cho phép (giây). Chặn ở đây để kiểm soát dung lượng.
  max_seconds  INTEGER NOT NULL DEFAULT 120 CHECK (max_seconds BETWEEN 15 AND 300),
  due_at       TIMESTAMPTZ,
  status       homework_status NOT NULL DEFAULT 'draft',

  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS speaking_prompts_class_idx
  ON speaking_prompts (class_id, status, due_at);

DROP TRIGGER IF EXISTS speaking_prompts_updated_at ON speaking_prompts;
CREATE TRIGGER speaking_prompts_updated_at BEFORE UPDATE ON speaking_prompts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── speaking_submissions: bài nói học viên nộp ──────────────────────────────
CREATE TABLE IF NOT EXISTS speaking_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id     UUID NOT NULL REFERENCES speaking_prompts(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Đường dẫn audio trong bucket 'speaking-submissions'.
  -- Dạng {org_id}/{class_id}/{prompt_id}/{uuid}.webm — org_id ở ĐẦU để
  -- Storage RLS so được với JWT.
  storage_path  TEXT NOT NULL,
  duration_ms   INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  size_bytes    BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),

  status        speaking_status NOT NULL DEFAULT 'submitted',
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_late       BOOLEAN NOT NULL DEFAULT false,

  -- Điểm theo 4 tiêu chí IELTS Speaking. Thang điểm do trung tâm cấu hình
  -- (org_settings.grading_scale), nhưng lưu dạng số để tính trung bình.
  score_fluency     NUMERIC CHECK (score_fluency IS NULL OR score_fluency >= 0),
  score_pronunciation NUMERIC CHECK (score_pronunciation IS NULL OR score_pronunciation >= 0),
  score_vocabulary  NUMERIC CHECK (score_vocabulary IS NULL OR score_vocabulary >= 0),
  score_grammar     NUMERIC CHECK (score_grammar IS NULL OR score_grammar >= 0),
  score_overall     NUMERIC CHECK (score_overall IS NULL OR score_overall >= 0),

  feedback      TEXT,
  graded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  graded_at     TIMESTAMPTZ,

  -- Audio hết hạn sau 90 ngày kể từ khi chấm → job dọn xoá blob, giữ điểm.
  -- Đây là cơ chế chặn chi phí lưu trữ phình vô hạn.
  audio_expires_at TIMESTAMPTZ,
  audio_deleted    BOOLEAN NOT NULL DEFAULT false,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (prompt_id, membership_id)
);

CREATE INDEX IF NOT EXISTS speaking_subs_prompt_idx ON speaking_submissions (prompt_id, status);
CREATE INDEX IF NOT EXISTS speaking_subs_membership_idx ON speaking_submissions (membership_id, submitted_at DESC);
-- Index cho job dọn audio hết hạn
CREATE INDEX IF NOT EXISTS speaking_subs_expiry_idx
  ON speaking_submissions (audio_expires_at) WHERE NOT audio_deleted;

DROP TRIGGER IF EXISTS speaking_subs_updated_at ON speaking_submissions;
CREATE TRIGGER speaking_subs_updated_at BEFORE UPDATE ON speaking_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Nhất quán tenant ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_speaking_prompt_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM classes WHERE id = NEW.class_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Lớp không tồn tại: %', NEW.class_id; END IF;
  NEW.org_id := v_org;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS speaking_prompts_tenant_check ON speaking_prompts;
CREATE TRIGGER speaking_prompts_tenant_check
  BEFORE INSERT OR UPDATE ON speaking_prompts
  FOR EACH ROW EXECUTE FUNCTION enforce_speaking_prompt_tenant();

CREATE OR REPLACE FUNCTION enforce_speaking_sub_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prompt_org UUID;
  v_mem_org    UUID;
BEGIN
  SELECT org_id INTO v_prompt_org FROM speaking_prompts WHERE id = NEW.prompt_id;
  SELECT org_id INTO v_mem_org    FROM memberships      WHERE id = NEW.membership_id;

  IF v_prompt_org IS NULL OR v_mem_org IS NULL THEN
    RAISE EXCEPTION 'Đề nói hoặc học viên không tồn tại';
  END IF;
  IF v_prompt_org <> v_mem_org THEN
    RAISE EXCEPTION 'Vi phạm cô lập tenant: đề thuộc org % nhưng học viên thuộc org %',
      v_prompt_org, v_mem_org;
  END IF;

  NEW.org_id := v_prompt_org;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS speaking_subs_tenant_check ON speaking_submissions;
CREATE TRIGGER speaking_subs_tenant_check
  BEFORE INSERT OR UPDATE ON speaking_submissions
  FOR EACH ROW EXECUTE FUNCTION enforce_speaking_sub_tenant();

-- ── Quota: audio cũng tính vào dung lượng của org ───────────────────────────
CREATE OR REPLACE FUNCTION track_speaking_storage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.size_bytes IS NOT NULL THEN
    INSERT INTO org_storage_usage (org_id, bytes_used)
    VALUES (NEW.org_id, NEW.size_bytes)
    ON CONFLICT (org_id) DO UPDATE
      SET bytes_used = org_storage_usage.bytes_used + NEW.size_bytes;
  ELSIF TG_OP = 'DELETE' AND OLD.size_bytes IS NOT NULL AND NOT OLD.audio_deleted THEN
    UPDATE org_storage_usage
      SET bytes_used = GREATEST(0, bytes_used - OLD.size_bytes)
      WHERE org_id = OLD.org_id;
  -- Khi job dọn đánh dấu audio_deleted, trả lại quota
  ELSIF TG_OP = 'UPDATE' AND NEW.audio_deleted AND NOT OLD.audio_deleted
        AND OLD.size_bytes IS NOT NULL THEN
    UPDATE org_storage_usage
      SET bytes_used = GREATEST(0, bytes_used - OLD.size_bytes)
      WHERE org_id = OLD.org_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS speaking_subs_storage_tracking ON speaking_submissions;
CREATE TRIGGER speaking_subs_storage_tracking
  AFTER INSERT OR UPDATE OR DELETE ON speaking_submissions
  FOR EACH ROW EXECUTE FUNCTION track_speaking_storage();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE speaking_prompts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaking_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON speaking_prompts     FROM anon;
REVOKE ALL ON speaking_submissions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON speaking_prompts     TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON speaking_submissions TO authenticated;

-- Đề nói: staff quản lý; HV thấy đề đã published trong lớp mình
DROP POLICY IF EXISTS speaking_prompts_select_staff ON speaking_prompts;
CREATE POLICY speaking_prompts_select_staff ON speaking_prompts
  FOR SELECT TO authenticated
  USING (public.is_org_owner(org_id) OR public.teaches_class(class_id));

DROP POLICY IF EXISTS speaking_prompts_select_student ON speaking_prompts;
CREATE POLICY speaking_prompts_select_student ON speaking_prompts
  FOR SELECT TO authenticated
  USING (status IN ('published', 'closed') AND public.in_class(class_id));

DROP POLICY IF EXISTS speaking_prompts_write_staff ON speaking_prompts;
CREATE POLICY speaking_prompts_write_staff ON speaking_prompts
  FOR ALL TO authenticated
  USING (public.is_org_owner(org_id) OR public.teaches_class(class_id))
  WITH CHECK (public.is_org_owner(org_id) OR public.teaches_class(class_id));

-- Bài nộp: HV chỉ thấy bài của mình
DROP POLICY IF EXISTS speaking_subs_select_own ON speaking_submissions;
CREATE POLICY speaking_subs_select_own ON speaking_submissions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.id = speaking_submissions.membership_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS speaking_subs_select_staff ON speaking_submissions;
CREATE POLICY speaking_subs_select_staff ON speaking_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_org_owner(org_id)
    OR EXISTS (
      SELECT 1 FROM speaking_prompts p
      WHERE p.id = speaking_submissions.prompt_id AND public.teaches_class(p.class_id)
    )
  );

DROP POLICY IF EXISTS speaking_subs_insert_own ON speaking_submissions;
CREATE POLICY speaking_subs_insert_own ON speaking_submissions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.id = speaking_submissions.membership_id AND m.user_id = auth.uid()
  ));

-- HV nộp lại được khi CHƯA chấm; đã chấm thì không sửa (chặn ở RLS)
DROP POLICY IF EXISTS speaking_subs_update_own ON speaking_submissions;
CREATE POLICY speaking_subs_update_own ON speaking_submissions
  FOR UPDATE TO authenticated
  USING (
    status <> 'graded'
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = speaking_submissions.membership_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.id = speaking_submissions.membership_id AND m.user_id = auth.uid()
  ));

-- Giáo viên chấm
DROP POLICY IF EXISTS speaking_subs_update_staff ON speaking_submissions;
CREATE POLICY speaking_subs_update_staff ON speaking_submissions
  FOR UPDATE TO authenticated
  USING (
    public.is_org_owner(org_id)
    OR EXISTS (
      SELECT 1 FROM speaking_prompts p
      WHERE p.id = speaking_submissions.prompt_id AND public.teaches_class(p.class_id)
    )
  )
  WITH CHECK (
    public.is_org_owner(org_id)
    OR EXISTS (
      SELECT 1 FROM speaking_prompts p
      WHERE p.id = speaking_submissions.prompt_id AND public.teaches_class(p.class_id)
    )
  );

-- ── Bucket riêng cho audio bài nói ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'speaking-submissions',
  'speaking-submissions',
  false,
  15728640,  -- 15MB: dư sức cho 5 phút audio nén, chặn upload file lạ
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS speaking_storage_read ON storage.objects;
CREATE POLICY speaking_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'speaking-submissions'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- HV tự upload bài của mình → cần quyền ghi cho mọi thành viên org
DROP POLICY IF EXISTS speaking_storage_write ON storage.objects;
CREATE POLICY speaking_storage_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'speaking-submissions'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS speaking_storage_delete ON storage.objects;
CREATE POLICY speaking_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'speaking-submissions'
    AND public.is_org_staff(((storage.foldername(name))[1])::uuid)
  );

COMMENT ON TABLE speaking_prompts IS 'Đề nói do GV tạo. max_seconds chặn thời lượng để kiểm soát dung lượng lưu trữ.';
COMMENT ON TABLE speaking_submissions IS 'Bài nói HV nộp + điểm 4 tiêu chí IELTS. audio_expires_at + job dọn xoá audio cũ sau 90 ngày, giữ lại điểm — chặn chi phí lưu trữ phình vô hạn.';
