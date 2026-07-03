-- ════════════════════════════════════════════════════════════════════════════
-- Speaking-practice spinner: random topics / interview questions / vocab.
-- Run once on Supabase (SQL editor). Safe to re-run: IF NOT EXISTS everywhere.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists spinner_topics (
  id bigserial primary key,
  text text not null,
  difficulty text not null default 'medium',
  category text not null default 'general',
  language text not null default 'en',
  created_at timestamptz not null default now()
);

create table if not exists spinner_interview_questions (
  id bigserial primary key,
  text text not null,
  framework text not null default 'star',
  category text not null default 'behavioral',
  created_at timestamptz not null default now()
);

create table if not exists spinner_vocab (
  id bigserial primary key,
  word text not null,
  pos text not null default 'n.',
  definition text not null,
  sentence text,
  angle text,
  difficulty text not null default 'easy',
  language text not null default 'en',
  created_at timestamptz not null default now()
);

create table if not exists spinner_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id bigint not null,
  item_type text not null, -- 'topic' | 'vocab' | 'interview'
  spun_at timestamptz not null default now()
);

create table if not exists spinner_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en',
  difficulty text not null default 'random',
  updated_at timestamptz not null default now()
);

create index if not exists spinner_topics_lang_diff_cat on spinner_topics (language, difficulty, category);
create index if not exists spinner_interview_category on spinner_interview_questions (category);
create index if not exists spinner_vocab_lang_diff on spinner_vocab (language, difficulty);
create index if not exists spinner_history_user_type on spinner_history (user_id, item_type, spun_at);
