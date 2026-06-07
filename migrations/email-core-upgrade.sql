-- ════════════════════════════════════════════════════════════════════════════
-- Email feature core upgrade — run once on Supabase (SQL editor)
-- Safe to re-run: all statements use IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Watchdog heartbeat: when a slot last had an active run scheduled.
--    The hourly watchdog uses this to detect "dead" slots (no run in >25h)
--    and revive them, so a broken reschedule chain can never silently stop
--    a user's emails.
ALTER TABLE email_slots ADD COLUMN IF NOT EXISTS last_scheduled_at TIMESTAMPTZ;

-- 2. Audit trail of every send attempt (sent or failed). Lets you answer
--    "did user X get their email today?" and debug delivery issues.
CREATE TABLE IF NOT EXISTS email_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_id     UUID REFERENCES email_slots(id) ON DELETE SET NULL,
  status      TEXT NOT NULL,           -- 'sent' | 'failed'
  word        TEXT,                    -- the vocabulary word sent
  source      TEXT,                    -- 'journal' | 'translate_history' | 'new' | ...
  recipient   TEXT,                    -- email address it was sent to
  error       TEXT,                    -- error message when status = 'failed'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups by user and by day
CREATE INDEX IF NOT EXISTS email_log_user_idx     ON email_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_slot_idx     ON email_log (slot_id, created_at DESC);

-- RLS: users can read their own logs (writes happen via service role in Inngest)
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_log_select_own" ON email_log;
CREATE POLICY "email_log_select_own" ON email_log
  FOR SELECT USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- NOTE: email_slots.last_sent_date (TEXT) was added in a previous migration.
-- If you skipped it, run:
--   ALTER TABLE email_slots ADD COLUMN IF NOT EXISTS last_sent_date TEXT;
-- ════════════════════════════════════════════════════════════════════════════
