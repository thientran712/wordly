


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."class_member_role" AS ENUM (
    'teacher',
    'assistant',
    'student'
);


ALTER TYPE "public"."class_member_role" OWNER TO "postgres";


CREATE TYPE "public"."class_status" AS ENUM (
    'active',
    'archived'
);


ALTER TYPE "public"."class_status" OWNER TO "postgres";


CREATE TYPE "public"."membership_status" AS ENUM (
    'active',
    'invited',
    'removed'
);


ALTER TYPE "public"."membership_status" OWNER TO "postgres";


CREATE TYPE "public"."org_role" AS ENUM (
    'owner',
    'teacher',
    'student',
    'parent'
);


ALTER TYPE "public"."org_role" OWNER TO "postgres";


CREATE TYPE "public"."org_status" AS ENUM (
    'trial',
    'active',
    'suspended',
    'cancelled'
);


ALTER TYPE "public"."org_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  claims     jsonb;
  orgs_map   jsonb;
  uid        uuid;
BEGIN
  uid := (event->>'user_id')::uuid;

  SELECT COALESCE(jsonb_object_agg(m.org_id::text, m.role::text), '{}'::jsonb)
    INTO orgs_map
  FROM memberships m
  JOIN organizations o ON o.id = m.org_id
  WHERE m.user_id = uid
    AND m.status = 'active'
    AND o.status IN ('trial', 'active');

  claims := COALESCE(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{user_orgs}', orgs_map);

  RETURN jsonb_set(event, '{claims}', claims);
END $$;


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") IS 'Nhúng { org_id: role } vào JWT claim user_orgs để RLS không phải query bảng. Cấu hình tại Supabase Dashboard → Auth → Hooks.';



CREATE OR REPLACE FUNCTION "public"."enforce_class_member_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  class_org      UUID;
  membership_org UUID;
BEGIN
  SELECT org_id INTO class_org FROM classes WHERE id = NEW.class_id;
  SELECT org_id INTO membership_org FROM memberships WHERE id = NEW.membership_id;

  IF class_org IS NULL THEN
    RAISE EXCEPTION 'Lớp không tồn tại: %', NEW.class_id;
  END IF;
  IF membership_org IS NULL THEN
    RAISE EXCEPTION 'Membership không tồn tại: %', NEW.membership_id;
  END IF;
  IF class_org <> membership_org THEN
    RAISE EXCEPTION 'Vi phạm cô lập tenant: lớp thuộc org % nhưng membership thuộc org %',
      class_org, membership_org;
  END IF;

  -- Luôn tự điền org_id đúng, không tin giá trị client gửi lên.
  NEW.org_id := class_org;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."enforce_class_member_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  
  INSERT INTO public.email_preferences (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."in_class"("target_class" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM class_members cm
    JOIN memberships m ON m.id = cm.membership_id
    WHERE cm.class_id = target_class
      AND m.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."in_class"("target_class" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("target_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT public.jwt_org_role(target_org) IS NOT NULL;
$$;


ALTER FUNCTION "public"."is_org_member"("target_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_owner"("target_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT public.jwt_org_role(target_org) = 'owner';
$$;


ALTER FUNCTION "public"."is_org_owner"("target_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_staff"("target_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT public.jwt_org_role(target_org) IN ('owner', 'teacher');
$$;


ALTER FUNCTION "public"."is_org_staff"("target_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_class_by_code"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_class      classes;
  v_uid        uuid := auth.uid();
  v_membership memberships;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Khoá hàng lớp để bộ đếm lượt dùng không bị race khi cả lớp nhập cùng lúc.
  SELECT * INTO v_class
  FROM classes
  WHERE join_code = upper(trim(p_code))
    AND status = 'active'
  FOR UPDATE;

  IF v_class.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF v_class.join_code_expires_at IS NOT NULL AND v_class.join_code_expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_expired');
  END IF;

  IF v_class.join_code_uses >= v_class.join_code_max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_exhausted');
  END IF;

  -- Tìm membership sẵn có trong org, hoặc tạo mới với vai trò student.
  SELECT * INTO v_membership
  FROM memberships
  WHERE org_id = v_class.org_id AND user_id = v_uid;

  IF v_membership.id IS NULL THEN
    INSERT INTO memberships (org_id, user_id, role, status)
    VALUES (v_class.org_id, v_uid, 'student', 'active')
    RETURNING * INTO v_membership;
  ELSIF v_membership.status = 'removed' THEN
    -- Người từng bị xoá khỏi org không tự quay lại bằng mã lớp.
    RETURN jsonb_build_object('ok', false, 'error', 'membership_removed');
  END IF;

  -- Thêm vào lớp (không lỗi nếu đã ở trong lớp).
  INSERT INTO class_members (class_id, membership_id, org_id, role_in_class)
  VALUES (v_class.id, v_membership.id, v_class.org_id, 'student')
  ON CONFLICT (class_id, membership_id) DO NOTHING;

  -- Chỉ tăng bộ đếm khi thực sự có người mới vào lớp.
  IF FOUND THEN
    UPDATE classes SET join_code_uses = join_code_uses + 1 WHERE id = v_class.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', v_class.org_id,
    'class_id', v_class.id,
    'class_name', v_class.name,
    -- Client PHẢI refreshSession() sau đó: org context nằm trong JWT nên
    -- token hiện tại chưa có org mới này.
    'needs_session_refresh', true
  );
END $$;


ALTER FUNCTION "public"."join_class_by_code"("p_code" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."join_class_by_code"("p_code" "text") IS 'Tham gia lớp bằng mã, nguyên tử: kiểm hạn + lượt, tạo membership nếu cần, tăng bộ đếm.';



CREATE OR REPLACE FUNCTION "public"."jwt_org_role"("target_org" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb -> 'user_orgs' ->> target_org::text,
    NULL
  );
$$;


ALTER FUNCTION "public"."jwt_org_role"("target_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."teaches_class"("target_class" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM class_members cm
    JOIN memberships m ON m.id = cm.membership_id
    WHERE cm.class_id = target_class
      AND m.user_id = auth.uid()
      AND cm.role_in_class IN ('teacher', 'assistant')
  );
$$;


ALTER FUNCTION "public"."teaches_class"("target_class" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."class_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "membership_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role_in_class" "public"."class_member_role" DEFAULT 'student'::"public"."class_member_role" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."class_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."class_members" IS 'Học viên/GV trong lớp. org_id denormalize để RLS nhanh; trigger bảo đảm nhất quán tenant.';



CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "teacher_membership_id" "uuid",
    "status" "public"."class_status" DEFAULT 'active'::"public"."class_status" NOT NULL,
    "join_code" "text",
    "join_code_expires_at" timestamp with time zone,
    "join_code_max_uses" integer DEFAULT 50 NOT NULL,
    "join_code_uses" integer DEFAULT 0 NOT NULL,
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "classes_join_code_check" CHECK ((("join_code" IS NULL) OR ("join_code" ~ '^[A-Z0-9]{4,12}$'::"text"))),
    CONSTRAINT "classes_join_code_max_uses_check" CHECK ((("join_code_max_uses" >= 1) AND ("join_code_max_uses" <= 1000))),
    CONSTRAINT "classes_join_code_uses_check" CHECK (("join_code_uses" >= 0)),
    CONSTRAINT "classes_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 200)))
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


COMMENT ON TABLE "public"."classes" IS 'Lớp học trong một trung tâm. Mã lớp có hạn dùng và giới hạn lượt để không lan ra ngoài.';



CREATE TABLE IF NOT EXISTS "public"."email_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "slot_id" "uuid",
    "status" "text" NOT NULL,
    "word" "text",
    "source" "text",
    "recipient" "text",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "entry_ids" "jsonb"
);


ALTER TABLE "public"."email_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_preferences" (
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT false,
    "send_time" time without time zone DEFAULT '07:00:00'::time without time zone,
    "frequency" "text" DEFAULT 'daily'::"text",
    "custom_days" integer[] DEFAULT '{}'::integer[],
    "last_sent_at" timestamp with time zone,
    "unsubscribe_token" "text" DEFAULT ("gen_random_uuid"())::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_sent_word_id" "uuid",
    CONSTRAINT "email_preferences_frequency_check" CHECK (("frequency" = ANY (ARRAY['daily'::"text", 'weekdays'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."email_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "send_time" time without time zone NOT NULL,
    "enabled" boolean DEFAULT true,
    "last_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_sent_date" "text",
    "last_scheduled_at" timestamp with time zone
);


ALTER TABLE "public"."email_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "state" "text" DEFAULT 'new'::"text" NOT NULL,
    "stability" double precision DEFAULT 0 NOT NULL,
    "difficulty" double precision DEFAULT 5.0 NOT NULL,
    "due_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scheduled_days" integer DEFAULT 0 NOT NULL,
    "elapsed_days" integer DEFAULT 0 NOT NULL,
    "lapses" integer DEFAULT 0 NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    "last_reviewed_at" timestamp with time zone,
    "last_emailed_at" timestamp with time zone,
    "email_count" integer DEFAULT 0 NOT NULL,
    "content" "text" NOT NULL
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "invited_email" "text",
    "role" "public"."org_role" DEFAULT 'student'::"public"."org_role" NOT NULL,
    "status" "public"."membership_status" DEFAULT 'active'::"public"."membership_status" NOT NULL,
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memberships_identity_check" CHECK ((("user_id" IS NOT NULL) OR ("invited_email" IS NOT NULL))),
    CONSTRAINT "memberships_invited_email_check" CHECK ((("invited_email" IS NULL) OR ("invited_email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::"text")))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


COMMENT ON TABLE "public"."memberships" IS 'Quan hệ người ↔ tổ chức + vai trò. Một người có thể thuộc nhiều org. Nguồn dữ liệu cho claim user_orgs trong JWT.';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "plan" "text" DEFAULT 'basic'::"text" NOT NULL,
    "status" "public"."org_status" DEFAULT 'trial'::"public"."org_status" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organizations_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 200))),
    CONSTRAINT "organizations_slug_check" CHECK (("slug" ~ '^[a-z0-9][a-z0-9-]{1,62}$'::"text"))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON TABLE "public"."organizations" IS 'Trung tâm Anh ngữ — đơn vị tenant. Tạo/xoá chỉ qua service role (quy trình bán hàng có kiểm soát).';



CREATE TABLE IF NOT EXISTS "public"."practice_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'New conversation'::"text" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "word_id" "uuid"
);


ALTER TABLE "public"."practice_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "name" "text",
    "avatar_url" "text",
    "level" "text" DEFAULT 'intermediate'::"text",
    "native_lang" "text" DEFAULT 'vi'::"text",
    "timezone" "text" DEFAULT 'Asia/Ho_Chi_Minh'::"text",
    "current_streak" integer DEFAULT 0,
    "longest_streak" integer DEFAULT 0,
    "total_learned" integer DEFAULT 0,
    "last_activity_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "skill_level" "text",
    "learning_goal" "text",
    "daily_goal" integer DEFAULT 5,
    "onboarded_at" timestamp with time zone,
    CONSTRAINT "profiles_daily_goal_check" CHECK ((("daily_goal" >= 1) AND ("daily_goal" <= 50))),
    CONSTRAINT "profiles_learning_goal_check" CHECK (("learning_goal" = ANY (ARRAY['daily'::"text", 'toeic'::"text", 'ielts'::"text", 'business'::"text", 'travel'::"text"]))),
    CONSTRAINT "profiles_level_check" CHECK (("level" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"]))),
    CONSTRAINT "profiles_skill_level_check" CHECK (("skill_level" = ANY (ARRAY['A1'::"text", 'A2'::"text", 'B1'::"text", 'B2'::"text", 'C1'::"text", 'C2'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "word_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "state_before" "text",
    "stability_before" double precision,
    "difficulty_before" double precision,
    "state_after" "text",
    "stability_after" double precision,
    "difficulty_after" double precision,
    "elapsed_days" integer,
    "scheduled_days" integer,
    "reviewed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "review_logs_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 4)))
);


ALTER TABLE "public"."review_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spinner_deep_talk" (
    "id" bigint NOT NULL,
    "text" "text" NOT NULL,
    "category" "text" DEFAULT 'self'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spinner_deep_talk" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."spinner_deep_talk_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."spinner_deep_talk_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."spinner_deep_talk_id_seq" OWNED BY "public"."spinner_deep_talk"."id";



CREATE TABLE IF NOT EXISTS "public"."spinner_history" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "item_id" bigint NOT NULL,
    "item_type" "text" NOT NULL,
    "spun_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spinner_history" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."spinner_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."spinner_history_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."spinner_history_id_seq" OWNED BY "public"."spinner_history"."id";



CREATE TABLE IF NOT EXISTS "public"."spinner_interview_questions" (
    "id" bigint NOT NULL,
    "text" "text" NOT NULL,
    "framework" "text" DEFAULT 'star'::"text" NOT NULL,
    "category" "text" DEFAULT 'behavioral'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spinner_interview_questions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."spinner_interview_questions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."spinner_interview_questions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."spinner_interview_questions_id_seq" OWNED BY "public"."spinner_interview_questions"."id";



CREATE TABLE IF NOT EXISTS "public"."spinner_preferences" (
    "user_id" "uuid" NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "difficulty" "text" DEFAULT 'random'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spinner_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spinner_topics" (
    "id" bigint NOT NULL,
    "text" "text" NOT NULL,
    "difficulty" "text" DEFAULT 'medium'::"text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spinner_topics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."spinner_topics_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."spinner_topics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."spinner_topics_id_seq" OWNED BY "public"."spinner_topics"."id";



CREATE TABLE IF NOT EXISTS "public"."spinner_vocab" (
    "id" bigint NOT NULL,
    "word" "text" NOT NULL,
    "pos" "text" DEFAULT 'n.'::"text" NOT NULL,
    "definition" "text" NOT NULL,
    "sentence" "text",
    "angle" "text",
    "difficulty" "text" DEFAULT 'easy'::"text" NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spinner_vocab" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."spinner_vocab_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."spinner_vocab_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."spinner_vocab_id_seq" OWNED BY "public"."spinner_vocab"."id";



CREATE TABLE IF NOT EXISTS "public"."translate_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_text" "text" NOT NULL,
    "translated_text" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "saved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_emailed_at" timestamp with time zone,
    "email_count" integer DEFAULT 0 NOT NULL,
    "state" "text" DEFAULT 'new'::"text" NOT NULL,
    "stability" numeric,
    "difficulty" numeric,
    "due_at" timestamp with time zone,
    "review_count" integer DEFAULT 0 NOT NULL,
    "lapses" integer DEFAULT 0 NOT NULL,
    "scheduled_days" numeric,
    "elapsed_days" numeric,
    "last_reviewed_at" timestamp with time zone,
    "is_saved" boolean DEFAULT false NOT NULL,
    CONSTRAINT "translate_history_direction_check" CHECK (("direction" = ANY (ARRAY['EN→VI'::"text", 'VI→EN'::"text"])))
);


ALTER TABLE "public"."translate_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "word_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'new'::"text",
    "is_bookmarked" boolean DEFAULT false,
    "ease_factor" double precision DEFAULT 2.5,
    "interval_days" integer DEFAULT 1,
    "next_review_at" timestamp with time zone,
    "review_count" integer DEFAULT 0,
    "correct_count" integer DEFAULT 0,
    "last_reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "stability" double precision DEFAULT 0,
    "difficulty" double precision DEFAULT 5.0,
    "state" "text" DEFAULT 'new'::"text",
    "scheduled_days" integer DEFAULT 0,
    "elapsed_days" integer DEFAULT 0,
    "lapses" integer DEFAULT 0,
    "due_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_progress_state_check" CHECK (("state" = ANY (ARRAY['new'::"text", 'learning'::"text", 'review'::"text", 'relearning'::"text"]))),
    CONSTRAINT "user_progress_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'learning'::"text", 'reviewing'::"text", 'mastered'::"text"])))
);


ALTER TABLE "public"."user_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."word_ai_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "word_id" integer NOT NULL,
    "skill_level" "text" NOT NULL,
    "examples" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "paragraph" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "definition_en" "text" DEFAULT ''::"text" NOT NULL,
    "definition_vi" "text" DEFAULT ''::"text" NOT NULL,
    "phonetic_ipa" "text" DEFAULT ''::"text",
    "meanings" "jsonb" DEFAULT '[]'::"jsonb",
    "synonyms" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."word_ai_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."word_dictionary_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "word" "text" NOT NULL,
    "meanings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "phonetic_us" "text" DEFAULT ''::"text" NOT NULL,
    "phonetic_uk" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."word_dictionary_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."word_layers" (
    "word_id" "uuid" NOT NULL,
    "semantic_family" "text",
    "topic" "text",
    "register" "text",
    "collocations" "jsonb" DEFAULT '[]'::"jsonb",
    "usage_notes" "text",
    "frequency" smallint,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."word_layers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."words" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "word" "text" NOT NULL,
    "phonetic" "text",
    "pos" "text",
    "level" "text" DEFAULT 'intermediate'::"text",
    "def_en" "text" NOT NULL,
    "ex_en" "text",
    "synonyms" "text"[] DEFAULT '{}'::"text"[],
    "audio_url" "text",
    "source" "text" DEFAULT 'curated'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "frequency_rank" integer
);


ALTER TABLE "public"."words" OWNER TO "postgres";


ALTER TABLE ONLY "public"."spinner_deep_talk" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."spinner_deep_talk_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."spinner_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."spinner_history_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."spinner_interview_questions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."spinner_interview_questions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."spinner_topics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."spinner_topics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."spinner_vocab" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."spinner_vocab_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."class_members"
    ADD CONSTRAINT "class_members_class_id_membership_id_key" UNIQUE ("class_id", "membership_id");



ALTER TABLE ONLY "public"."class_members"
    ADD CONSTRAINT "class_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_join_code_key" UNIQUE ("join_code");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_log"
    ADD CONSTRAINT "email_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_preferences"
    ADD CONSTRAINT "email_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."email_preferences"
    ADD CONSTRAINT "email_preferences_unsubscribe_token_key" UNIQUE ("unsubscribe_token");



ALTER TABLE ONLY "public"."email_slots"
    ADD CONSTRAINT "email_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_logs"
    ADD CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spinner_deep_talk"
    ADD CONSTRAINT "spinner_deep_talk_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spinner_history"
    ADD CONSTRAINT "spinner_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spinner_interview_questions"
    ADD CONSTRAINT "spinner_interview_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spinner_preferences"
    ADD CONSTRAINT "spinner_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."spinner_topics"
    ADD CONSTRAINT "spinner_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spinner_vocab"
    ADD CONSTRAINT "spinner_vocab_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."translate_history"
    ADD CONSTRAINT "translate_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_user_id_word_id_key" UNIQUE ("user_id", "word_id");



ALTER TABLE ONLY "public"."word_ai_content"
    ADD CONSTRAINT "word_ai_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."word_ai_content"
    ADD CONSTRAINT "word_ai_content_word_id_skill_level_key" UNIQUE ("word_id", "skill_level");



ALTER TABLE ONLY "public"."word_dictionary_cache"
    ADD CONSTRAINT "word_dictionary_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."word_dictionary_cache"
    ADD CONSTRAINT "word_dictionary_cache_word_key" UNIQUE ("word");



ALTER TABLE ONLY "public"."word_layers"
    ADD CONSTRAINT "word_layers_pkey" PRIMARY KEY ("word_id");



ALTER TABLE ONLY "public"."words"
    ADD CONSTRAINT "words_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."words"
    ADD CONSTRAINT "words_word_key" UNIQUE ("word");



CREATE INDEX "class_members_class_idx" ON "public"."class_members" USING "btree" ("class_id", "role_in_class");



CREATE INDEX "class_members_membership_idx" ON "public"."class_members" USING "btree" ("membership_id");



CREATE INDEX "class_members_org_idx" ON "public"."class_members" USING "btree" ("org_id");



CREATE INDEX "classes_org_idx" ON "public"."classes" USING "btree" ("org_id", "status");



CREATE INDEX "classes_teacher_idx" ON "public"."classes" USING "btree" ("teacher_membership_id") WHERE ("teacher_membership_id" IS NOT NULL);



CREATE INDEX "email_log_slot_idx" ON "public"."email_log" USING "btree" ("slot_id", "created_at" DESC);



CREATE INDEX "email_log_user_idx" ON "public"."email_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "email_slots_user_id_idx" ON "public"."email_slots" USING "btree" ("user_id");



CREATE INDEX "idx_progress_due" ON "public"."user_progress" USING "btree" ("user_id", "due_at");



CREATE INDEX "idx_progress_review" ON "public"."user_progress" USING "btree" ("user_id", "next_review_at");



CREATE INDEX "idx_progress_state" ON "public"."user_progress" USING "btree" ("user_id", "state");



CREATE INDEX "idx_progress_user" ON "public"."user_progress" USING "btree" ("user_id");



CREATE INDEX "idx_review_logs_user" ON "public"."review_logs" USING "btree" ("user_id", "reviewed_at" DESC);



CREATE INDEX "idx_review_logs_word" ON "public"."review_logs" USING "btree" ("user_id", "word_id");



CREATE INDEX "idx_translate_history_unsaved_lookup" ON "public"."translate_history" USING "btree" ("user_id", "source_text", "direction", "saved_at" DESC) WHERE ("is_saved" = false);



CREATE INDEX "idx_word_ai_word_level" ON "public"."word_ai_content" USING "btree" ("word_id", "skill_level");



CREATE INDEX "idx_word_dictionary_cache_word" ON "public"."word_dictionary_cache" USING "btree" ("word");



CREATE INDEX "idx_words_frequency" ON "public"."words" USING "btree" ("frequency_rank");



CREATE INDEX "idx_words_level" ON "public"."words" USING "btree" ("level");



CREATE INDEX "idx_words_word" ON "public"."words" USING "btree" ("word");



CREATE UNIQUE INDEX "memberships_org_invite_uniq" ON "public"."memberships" USING "btree" ("org_id", "lower"("invited_email")) WHERE (("invited_email" IS NOT NULL) AND ("user_id" IS NULL));



CREATE INDEX "memberships_org_role_idx" ON "public"."memberships" USING "btree" ("org_id", "role", "status");



CREATE UNIQUE INDEX "memberships_org_user_uniq" ON "public"."memberships" USING "btree" ("org_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "memberships_user_idx" ON "public"."memberships" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "practice_sessions_word_idx" ON "public"."practice_sessions" USING "btree" ("user_id", "word_id");



CREATE INDEX "spinner_deep_talk_category" ON "public"."spinner_deep_talk" USING "btree" ("category");



CREATE INDEX "spinner_history_user_type" ON "public"."spinner_history" USING "btree" ("user_id", "item_type", "spun_at");



CREATE INDEX "spinner_interview_category" ON "public"."spinner_interview_questions" USING "btree" ("category");



CREATE INDEX "spinner_topics_lang_diff_cat" ON "public"."spinner_topics" USING "btree" ("language", "difficulty", "category");



CREATE INDEX "spinner_vocab_lang_diff" ON "public"."spinner_vocab" USING "btree" ("language", "difficulty");



CREATE INDEX "translate_history_due_idx" ON "public"."translate_history" USING "btree" ("user_id", "due_at");



CREATE INDEX "translate_history_user_id_last_emailed_at_idx" ON "public"."translate_history" USING "btree" ("user_id", "last_emailed_at");



CREATE INDEX "word_layers_family_idx" ON "public"."word_layers" USING "btree" ("semantic_family");



CREATE INDEX "word_layers_topic_idx" ON "public"."word_layers" USING "btree" ("topic");



CREATE OR REPLACE TRIGGER "class_members_tenant_check" BEFORE INSERT OR UPDATE ON "public"."class_members" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_class_member_tenant"();



CREATE OR REPLACE TRIGGER "classes_updated_at" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "memberships_updated_at" BEFORE UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."class_members"
    ADD CONSTRAINT "class_members_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_members"
    ADD CONSTRAINT "class_members_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_members"
    ADD CONSTRAINT "class_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_teacher_membership_id_fkey" FOREIGN KEY ("teacher_membership_id") REFERENCES "public"."memberships"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_log"
    ADD CONSTRAINT "email_log_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."email_slots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_log"
    ADD CONSTRAINT "email_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_preferences"
    ADD CONSTRAINT "email_preferences_last_sent_word_id_fkey" FOREIGN KEY ("last_sent_word_id") REFERENCES "public"."words"("id");



ALTER TABLE ONLY "public"."email_preferences"
    ADD CONSTRAINT "email_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_slots"
    ADD CONSTRAINT "email_slots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_logs"
    ADD CONSTRAINT "review_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_logs"
    ADD CONSTRAINT "review_logs_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spinner_history"
    ADD CONSTRAINT "spinner_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spinner_preferences"
    ADD CONSTRAINT "spinner_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."translate_history"
    ADD CONSTRAINT "translate_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."word_layers"
    ADD CONSTRAINT "word_layers_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete own progress" ON "public"."user_progress" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own email prefs" ON "public"."email_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own logs" ON "public"."review_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own progress" ON "public"."user_progress" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own history" ON "public"."translate_history" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own sessions" ON "public"."practice_sessions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own slots" ON "public"."email_slots" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own review logs" ON "public"."review_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own email prefs" ON "public"."email_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own progress" ON "public"."user_progress" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own email prefs" ON "public"."email_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own logs" ON "public"."review_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own progress" ON "public"."user_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own journal" ON "public"."journal_entries" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Words are viewable by everyone" ON "public"."words" FOR SELECT USING (true);



CREATE POLICY "auth read ai content" ON "public"."word_ai_content" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "auth read dictionary cache" ON "public"."word_dictionary_cache" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."class_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_members_delete_staff" ON "public"."class_members" FOR DELETE TO "authenticated" USING (("public"."is_org_owner"("org_id") OR "public"."teaches_class"("class_id")));



CREATE POLICY "class_members_insert_staff" ON "public"."class_members" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_org_owner"("org_id") OR "public"."teaches_class"("class_id")));



CREATE POLICY "class_members_select" ON "public"."class_members" FOR SELECT TO "authenticated" USING (("public"."is_org_staff"("org_id") OR "public"."in_class"("class_id")));



ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classes_delete_owner" ON "public"."classes" FOR DELETE TO "authenticated" USING ("public"."is_org_owner"("org_id"));



CREATE POLICY "classes_insert_staff" ON "public"."classes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_staff"("org_id"));



CREATE POLICY "classes_select_member" ON "public"."classes" FOR SELECT TO "authenticated" USING ("public"."in_class"("id"));



CREATE POLICY "classes_select_staff" ON "public"."classes" FOR SELECT TO "authenticated" USING ("public"."is_org_staff"("org_id"));



CREATE POLICY "classes_update_staff" ON "public"."classes" FOR UPDATE TO "authenticated" USING (("public"."is_org_owner"("org_id") OR ("public"."is_org_staff"("org_id") AND "public"."teaches_class"("id")))) WITH CHECK (("public"."is_org_owner"("org_id") OR ("public"."is_org_staff"("org_id") AND "public"."teaches_class"("id"))));



ALTER TABLE "public"."email_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_log_select_own" ON "public"."email_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."email_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memberships_accept_invite" ON "public"."memberships" FOR UPDATE TO "authenticated" USING ((("user_id" IS NULL) AND ("status" = 'invited'::"public"."membership_status") AND ("lower"("invited_email") = "lower"(COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text"))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'active'::"public"."membership_status")));



CREATE POLICY "memberships_delete_owner" ON "public"."memberships" FOR DELETE TO "authenticated" USING ("public"."is_org_owner"("org_id"));



CREATE POLICY "memberships_insert_owner" ON "public"."memberships" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_owner"("org_id"));



CREATE POLICY "memberships_select_self" ON "public"."memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "memberships_select_staff" ON "public"."memberships" FOR SELECT TO "authenticated" USING ("public"."is_org_staff"("org_id"));



CREATE POLICY "memberships_update_owner" ON "public"."memberships" FOR UPDATE TO "authenticated" USING ("public"."is_org_owner"("org_id")) WITH CHECK ("public"."is_org_owner"("org_id"));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_select_member" ON "public"."organizations" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("id"));



CREATE POLICY "organizations_update_owner" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ("public"."is_org_owner"("id")) WITH CHECK ("public"."is_org_owner"("id"));



ALTER TABLE "public"."practice_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service write ai content" ON "public"."word_ai_content" TO "service_role" USING (true);



CREATE POLICY "service write dictionary cache" ON "public"."word_dictionary_cache" TO "service_role" USING (true);



ALTER TABLE "public"."spinner_deep_talk" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spinner_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spinner_interview_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spinner_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spinner_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spinner_vocab" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."translate_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."word_ai_content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."word_dictionary_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."word_layers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."words" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."enforce_class_member_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_class_member_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_class_member_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."in_class"("target_class" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."in_class"("target_class" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."in_class"("target_class" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_member"("target_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("target_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("target_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_owner"("target_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_owner"("target_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_owner"("target_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_staff"("target_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_staff"("target_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_staff"("target_org" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_class_by_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_class_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_class_by_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."jwt_org_role"("target_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."jwt_org_role"("target_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jwt_org_role"("target_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."teaches_class"("target_class" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."teaches_class"("target_class" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."teaches_class"("target_class" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."class_members" TO "authenticated";
GRANT ALL ON TABLE "public"."class_members" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."email_log" TO "anon";
GRANT ALL ON TABLE "public"."email_log" TO "authenticated";
GRANT ALL ON TABLE "public"."email_log" TO "service_role";



GRANT ALL ON TABLE "public"."email_preferences" TO "anon";
GRANT ALL ON TABLE "public"."email_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."email_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."email_slots" TO "anon";
GRANT ALL ON TABLE "public"."email_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."email_slots" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";
GRANT SELECT ON TABLE "public"."memberships" TO "supabase_auth_admin";



GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";
GRANT SELECT ON TABLE "public"."organizations" TO "supabase_auth_admin";



GRANT ALL ON TABLE "public"."practice_sessions" TO "anon";
GRANT ALL ON TABLE "public"."practice_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."review_logs" TO "anon";
GRANT ALL ON TABLE "public"."review_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."review_logs" TO "service_role";



GRANT ALL ON TABLE "public"."spinner_deep_talk" TO "anon";
GRANT ALL ON TABLE "public"."spinner_deep_talk" TO "authenticated";
GRANT ALL ON TABLE "public"."spinner_deep_talk" TO "service_role";



GRANT ALL ON SEQUENCE "public"."spinner_deep_talk_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."spinner_deep_talk_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."spinner_deep_talk_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."spinner_history" TO "anon";
GRANT ALL ON TABLE "public"."spinner_history" TO "authenticated";
GRANT ALL ON TABLE "public"."spinner_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."spinner_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."spinner_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."spinner_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."spinner_interview_questions" TO "anon";
GRANT ALL ON TABLE "public"."spinner_interview_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."spinner_interview_questions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."spinner_interview_questions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."spinner_interview_questions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."spinner_interview_questions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."spinner_preferences" TO "anon";
GRANT ALL ON TABLE "public"."spinner_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."spinner_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."spinner_topics" TO "anon";
GRANT ALL ON TABLE "public"."spinner_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."spinner_topics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."spinner_topics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."spinner_topics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."spinner_topics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."spinner_vocab" TO "anon";
GRANT ALL ON TABLE "public"."spinner_vocab" TO "authenticated";
GRANT ALL ON TABLE "public"."spinner_vocab" TO "service_role";



GRANT ALL ON SEQUENCE "public"."spinner_vocab_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."spinner_vocab_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."spinner_vocab_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."translate_history" TO "anon";
GRANT ALL ON TABLE "public"."translate_history" TO "authenticated";
GRANT ALL ON TABLE "public"."translate_history" TO "service_role";



GRANT ALL ON TABLE "public"."user_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_progress" TO "service_role";



GRANT ALL ON TABLE "public"."word_ai_content" TO "anon";
GRANT ALL ON TABLE "public"."word_ai_content" TO "authenticated";
GRANT ALL ON TABLE "public"."word_ai_content" TO "service_role";



GRANT ALL ON TABLE "public"."word_dictionary_cache" TO "anon";
GRANT ALL ON TABLE "public"."word_dictionary_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."word_dictionary_cache" TO "service_role";



GRANT ALL ON TABLE "public"."word_layers" TO "anon";
GRANT ALL ON TABLE "public"."word_layers" TO "authenticated";
GRANT ALL ON TABLE "public"."word_layers" TO "service_role";



GRANT ALL ON TABLE "public"."words" TO "anon";
GRANT ALL ON TABLE "public"."words" TO "authenticated";
GRANT ALL ON TABLE "public"."words" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







