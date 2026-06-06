export async function POST(request) {
  const { text, source = "EN", target = "VI" } = await request.json();

  if (!text?.trim()) return Response.json({ error: "No text" }, { status: 400 });

  const apiKey = process.env.DEEPL_API_KEY;
  const isFree = apiKey?.endsWith(":fx");
  const endpoint = isFree
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [text],
      source_lang: source === "VI" ? "VI" : "EN",
      target_lang: target === "VI" ? "VI" : "EN",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: `DeepL error: ${err}` }, { status: res.status });
  }

  const data = await res.json();
  const translated = data.translations?.[0]?.text ?? "";
  const detectedLang = data.translations?.[0]?.detected_source_language ?? source;

  return Response.json({ translated, detectedLang });
}
