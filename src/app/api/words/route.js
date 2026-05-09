import { createClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("words")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ words: data, count: data.length });
}
