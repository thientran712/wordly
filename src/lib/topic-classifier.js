// Rule-based topic classifier — assigns a broad topic to any word based on
// keyword matches in its English definition (and the word itself). This is a
// heuristic, not an AI classification pass, so it can run instantly over the
// entire dictionary with no API cost. Order matters: earlier rules win, so
// more specific topics are listed before more generic ones.
export const TOPICS = [
  { key: "business", label: "Business & Strategy", icon: "💼" },
  { key: "technology", label: "Technology & AI", icon: "💻" },
  { key: "law_finance", label: "Law & Finance", icon: "⚖️" },
  { key: "health", label: "Health & Medicine", icon: "🏥" },
  { key: "science", label: "Science & Nature", icon: "🔬" },
  { key: "travel", label: "Travel & Places", icon: "✈️" },
  { key: "food", label: "Food & Cooking", icon: "🍳" },
  { key: "emotions", label: "Emotions & Feelings", icon: "❤️" },
  { key: "psychology", label: "Psychology & Behavior", icon: "🧠" },
  { key: "communication", label: "Communication", icon: "🗣️" },
  { key: "academic", label: "Academic & Education", icon: "🎓" },
  { key: "daily", label: "Daily Life", icon: "☀️" },
];

const KEYWORD_RULES = {
  business: ["company", "business", "market", "sell", "customer", "manager", "employee", "profit", "trade", "industry", "product", "office", "job", "career", "salary", "corporate", "investment", "brand"],
  technology: ["computer", "software", "internet", "digital", "device", "data", "app", "website", "online", "network", "electronic", "machine", "robot", "artificial intelligence", "code", "program"],
  law_finance: ["law", "legal", "court", "judge", "crime", "police", "finance", "bank", "tax", "contract", "money", "loan", "debt", "insurance", "government", "policy", "vote", "election"],
  health: ["disease", "illness", "medicine", "doctor", "hospital", "patient", "symptom", "treatment", "body", "health", "medical", "pain", "injury", "surgery", "drug", "nurse"],
  science: ["chemical", "physics", "biology", "scientist", "experiment", "energy", "animal", "plant", "nature", "environment", "weather", "climate", "species", "cell", "molecule", "gas", "liquid", "planet", "universe"],
  travel: ["travel", "journey", "airport", "flight", "hotel", "tourist", "passport", "country", "city", "abroad", "vacation", "holiday", "map", "border", "destination"],
  food: ["food", "eat", "cook", "recipe", "meal", "restaurant", "kitchen", "taste", "flavor", "drink", "fruit", "vegetable", "meat", "dish", "ingredient"],
  emotions: ["feeling", "feel", "happy", "sad", "angry", "afraid", "fear", "joy", "excite", "worry", "anxious", "emotion", "love", "hate", "proud", "embarrassed", "nervous"],
  psychology: ["mind", "behavior", "psychology", "personality", "thought", "belief", "memory", "perception", "motivation", "attitude", "mental"],
  communication: ["say", "speak", "talk", "tell", "conversation", "language", "word", "sentence", "discuss", "argue", "explain", "communicate", "message", "letter", "call"],
  academic: ["study", "school", "student", "teacher", "university", "education", "learn", "research", "exam", "degree", "course", "lecture", "academic", "knowledge"],
};

function posBucket(pos) {
  if (!pos) return "daily";
  const p = pos.toLowerCase();
  if (p.includes("verb")) return "daily";
  if (p.includes("adjective")) return "emotions";
  if (p.includes("noun")) return "daily";
  return "daily";
}

export function classifyTopic({ word, def_en, pos }) {
  const haystack = `${word || ""} ${def_en || ""}`.toLowerCase();
  for (const topicKey of Object.keys(KEYWORD_RULES)) {
    const keywords = KEYWORD_RULES[topicKey];
    if (keywords.some((kw) => haystack.includes(kw))) {
      return topicKey;
    }
  }
  return posBucket(pos);
}
