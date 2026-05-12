import { createClient } from "@/lib/supabase-server";

export async function POST(request) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const { skill_level, learning_goal, daily_goal } = await request.json();
  
  // Validate
  const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const validGoals = ['daily', 'toeic', 'ielts', 'business', 'travel'];
  
  if (!validLevels.includes(skill_level)) {
    return Response.json({ error: "Invalid skill level" }, { status: 400 });
  }
  if (!validGoals.includes(learning_goal)) {
    return Response.json({ error: "Invalid learning goal" }, { status: 400 });
  }
  if (daily_goal < 1 || daily_goal > 50) {
    return Response.json({ error: "Invalid daily goal" }, { status: 400 });
  }
  
  const { error } = await supabase
    .from("profiles")
    .update({
      skill_level,
      learning_goal,
      daily_goal,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  return Response.json({ success: true });
}

export async function GET() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const { data, error } = await supabase
    .from("profiles")
    .select("skill_level, learning_goal, daily_goal, onboarded_at")
    .eq("id", user.id)
    .single();
  
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  return Response.json({ 
    profile: data,
    is_onboarded: !!data?.onboarded_at,
  });
}
