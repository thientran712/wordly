-- ════════════════════════════════════════════════════════════════════════════
-- Baseline TỐI THIỂU cho test B2B ở local (Cách B trong docs/LOCAL-SETUP-B2B.md)
--
-- BỐI CẢNH: các bảng lõi của Wordly được tạo tay trên Supabase dashboard và
-- KHÔNG có CREATE TABLE trong repo (xem PRODUCT.md mục 5). File này dựng lại
-- phần tối thiểu mà migration B2B cần tham chiếu, để `supabase db reset` chạy
-- được ở local.
--
-- ĐÂY KHÔNG PHẢI schema production đầy đủ. Cột có thể thiếu so với thật.
-- Cách đúng về lâu dài là dump baseline từ production (Cách A).
--
-- Đặt file này vào supabase/migrations/00000000000000_baseline.sql nếu muốn
-- `db reset` tự chạy, hoặc chạy tay qua Studio trước các migration khác.
-- ════════════════════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  name          TEXT,
  timezone      TEXT DEFAULT 'Asia/Ho_Chi_Minh',
  skill_level   TEXT DEFAULT 'B1',
  learning_goal TEXT DEFAULT 'daily',
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_insert_own ON profiles;
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Tự tạo profile khi có user mới (production làm việc này bằng trigger tương tự)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── words ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS words (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word      TEXT NOT NULL UNIQUE,
  phonetic  TEXT,
  pos       TEXT,
  level     TEXT,
  def_en    TEXT,
  def_vi    TEXT,
  ex_en     TEXT,
  ex_vi     TEXT,
  synonyms  TEXT[],
  audio_url TEXT
);

-- ── translate_history ───────────────────────────────────────────────────────
-- Bảng này quan trọng với B2B: snapshot tiến độ và streak đọc từ đây.
CREATE TABLE IF NOT EXISTS translate_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_text      TEXT NOT NULL,
  translated_text  TEXT,
  direction        TEXT NOT NULL DEFAULT 'EN→VI',
  is_saved         BOOLEAN NOT NULL DEFAULT false,
  saved_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Cột FSRS
  state            TEXT NOT NULL DEFAULT 'new',
  stability        NUMERIC,
  difficulty       NUMERIC,
  due_at           TIMESTAMPTZ,
  review_count     INTEGER NOT NULL DEFAULT 0,
  lapses           INTEGER NOT NULL DEFAULT 0,
  scheduled_days   NUMERIC,
  elapsed_days     NUMERIC,
  last_reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS translate_history_due_idx ON translate_history (user_id, due_at);

ALTER TABLE translate_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS translate_history_own ON translate_history;
CREATE POLICY translate_history_own ON translate_history
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── journal_entries ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  state            TEXT NOT NULL DEFAULT 'new',
  stability        NUMERIC,
  difficulty       NUMERIC,
  due_at           TIMESTAMPTZ,
  review_count     INTEGER NOT NULL DEFAULT 0,
  lapses           INTEGER NOT NULL DEFAULT 0,
  scheduled_days   NUMERIC,
  elapsed_days     NUMERIC,
  last_reviewed_at TIMESTAMPTZ
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_entries_own ON journal_entries;
CREATE POLICY journal_entries_own ON journal_entries
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── email_slots / email_preferences / email_log ─────────────────────────────
CREATE TABLE IF NOT EXISTS email_preferences (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  send_time   TEXT,
  frequency   TEXT NOT NULL DEFAULT 'daily',
  custom_days JSONB,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_slots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  send_time         TEXT NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  last_sent_date    TEXT,
  last_scheduled_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_id    UUID REFERENCES email_slots(id) ON DELETE SET NULL,
  status     TEXT NOT NULL,
  word       TEXT,
  source     TEXT,
  recipient  TEXT,
  error      TEXT,
  entry_ids  JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_log_user_idx ON email_log (user_id, created_at DESC);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_log_select_own ON email_log;
CREATE POLICY email_log_select_own ON email_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── Các bảng phụ trợ mà route hiện có tham chiếu ────────────────────────────
CREATE TABLE IF NOT EXISTS word_layers (
  word_id         UUID PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
  semantic_family TEXT,
  topic           TEXT,
  register        TEXT,
  collocations    JSONB DEFAULT '[]',
  usage_notes     TEXT,
  frequency       SMALLINT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  state   TEXT DEFAULT 'new',
  due_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, word_id)
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT,
  messages   JSONB NOT NULL DEFAULT '[]',
  word_id    UUID REFERENCES words(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS practice_sessions_own ON practice_sessions;
CREATE POLICY practice_sessions_own ON practice_sessions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS word_dictionary_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word        TEXT NOT NULL UNIQUE,
  phonetic_us TEXT NOT NULL DEFAULT '',
  phonetic_uk TEXT NOT NULL DEFAULT '',
  meanings    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS word_ai_content (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id       UUID NOT NULL,
  skill_level   TEXT NOT NULL,
  meanings      JSONB DEFAULT '[]',
  synonyms      JSONB DEFAULT '[]',
  examples      JSONB NOT NULL DEFAULT '[]',
  paragraph     TEXT NOT NULL DEFAULT '',
  definition_en TEXT NOT NULL DEFAULT '',
  definition_vi TEXT NOT NULL DEFAULT '',
  phonetic_ipa  TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (word_id, skill_level)
);

-- Lưu ý: production khai báo word_ai_content.word_id là `int` trong khi
-- words.id là UUID (xem PRODUCT.md mục 12.3). Ở đây dùng UUID cho đúng về
-- mặt logic; đây là một điểm cần thống nhất lại trên production.
