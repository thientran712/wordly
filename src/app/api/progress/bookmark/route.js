import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { word_id, is_bookmarked } = await request.json();
  
  const { data, error } = await supabase
    .from("user_progress")
    .upsert({
      user_id: user.id,
      word_id,
      is_bookmarked,
    }, { onConflict: "user_id,word_id" })
    .select();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ progress: data[0] });
}
