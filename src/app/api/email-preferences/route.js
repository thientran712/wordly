import { createClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const { data, error } = await supabase
    .from("email_preferences")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ preferences: data });
}

export async function PUT(request) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const body = await request.json();
  
  const { data, error } = await supabase
    .from("email_preferences")
    .upsert({
      user_id: user.id,
      enabled: true,  // Auto-enable khi user save settings
      send_time: body.send_time,
      frequency: body.frequency,
      custom_days: body.custom_days || [],
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ preferences: data[0] });
}
