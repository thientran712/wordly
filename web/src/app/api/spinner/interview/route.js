import { createAdminClient } from "@/lib/supabase-admin";

// Public — same reasoning as /api/spinner/topics.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "behavioral";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("spinner_interview_questions")
    .select("id, text, framework, category")
    .eq("category", category);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ questions: data || [] });
}
