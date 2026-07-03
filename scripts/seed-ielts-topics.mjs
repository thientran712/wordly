// Replaces spinner_topics entirely with real IELTS Speaking Part 1/2/3
// questions (category = "part1" | "part2" | "part3"), so the "Chủ đề" tab
// spins IELTS Speaking practice instead of the old general/roast/pitch topics.
//
// Run: node scripts/seed-ielts-topics.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();
const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));

// ── Part 1 — short questions about familiar everyday topics ───────────────
const PART1 = [
  "Do you work or are you a student?",
  "What do you like about your job/studies?",
  "What's your hometown like?",
  "Do you live in a house or an apartment?",
  "What do you usually do in your free time?",
  "Do you prefer spending time alone or with other people?",
  "What kind of music do you like?",
  "Did you learn music when you were a child?",
  "How often do you use the internet?",
  "What do you usually do online?",
  "Do you like reading books?",
  "What kind of books do you prefer?",
  "How do you usually travel to work or school?",
  "Do you think public transport in your city is good?",
  "What's your favorite season?",
  "Do you prefer hot or cold weather?",
  "Do you often cook for yourself?",
  "What's your favorite food?",
  "Do you enjoy shopping?",
  "Do you prefer shopping online or in stores?",
  "What did you do last weekend?",
  "How do you usually spend your weekends?",
  "Do you like taking photographs?",
  "What do you usually take photos of?",
  "Is your hometown a good place for tourists to visit?",
  "What's the traffic like in your city?",
  "Do you often watch TV?",
  "What kind of TV programs do you like?",
  "Do you like animals?",
  "Have you ever had a pet?",
  "What's your favorite color?",
  "Does the color of clothes matter to you?",
  "Do you like giving gifts to others?",
  "What kind of gifts do you like to receive?",
  "How do you keep fit?",
  "Do you play any sports?",
  "What's your favorite subject at school?",
  "Do you prefer studying alone or in groups?",
  "Do you often feel stressed?",
  "How do you relax when you're stressed?",
];

// ── Part 2 — cue card, 1-2 minute long turn ────────────────────────────────
const PART2 = [
  "Describe a person who has influenced you. You should say: who this person is, how you know them, what they are like, and explain how they have influenced you.",
  "Describe a place you visited that you found interesting. You should say: where it is, when you went there, what you did there, and explain why you found it interesting.",
  "Describe a skill you would like to learn. You should say: what the skill is, why you want to learn it, how you would learn it, and explain how this skill would help you.",
  "Describe a book that had a strong impact on you. You should say: what the book was about, when you read it, why you decided to read it, and explain how it impacted you.",
  "Describe a memorable trip you have taken. You should say: where you went, who you went with, what you did, and explain why it was memorable.",
  "Describe an item of technology you find useful. You should say: what it is, how often you use it, what you use it for, and explain why you find it useful.",
  "Describe a time when you helped someone. You should say: who you helped, what the situation was, what you did, and explain how you felt about it.",
  "Describe a goal you would like to achieve in the future. You should say: what the goal is, why it is important to you, what steps you plan to take, and explain how you feel about achieving it.",
  "Describe a piece of art or a design you admire. You should say: what it is, where you saw it, what it looks like, and explain why you admire it.",
  "Describe a decision you made that was difficult. You should say: what the decision was, why it was difficult, what you decided in the end, and explain how you felt afterward.",
  "Describe a tradition in your country that you find interesting. You should say: what the tradition is, when it happens, who takes part in it, and explain why you find it interesting.",
  "Describe a time you learned something new. You should say: what you learned, how you learned it, why you decided to learn it, and explain how you felt about the experience.",
  "Describe a public place you like to spend time in. You should say: where it is, what it looks like, what you do there, and explain why you like it.",
  "Describe a piece of news that surprised you. You should say: what the news was, how you found out about it, why it surprised you, and explain how you reacted.",
  "Describe a website or app you use often. You should say: what it is, when you started using it, what you use it for, and explain why it is useful to you.",
];

// ── Part 3 — abstract discussion, related to the Part 2 topic ─────────────
const PART3 = [
  "Why do you think some people are more influential than others?",
  "Do you think role models are important for young people? Why?",
  "How has technology changed the way people learn new skills?",
  "Do you think everyone should learn a second language? Why or why not?",
  "What are the benefits of traveling to other countries?",
  "Do you think tourism has a positive or negative effect on local culture?",
  "How do books compare to films as a way of telling a story?",
  "Do you think people read less now than in the past? Why?",
  "What skills do you think will be important in the future job market?",
  "Should schools focus more on practical skills or academic knowledge?",
  "How does helping others benefit the person who helps, not just the person being helped?",
  "Do you think community involvement is more common now than in the past?",
  "What makes a goal realistic or unrealistic?",
  "Do you think it's better to have short-term or long-term goals?",
  "Why do you think traditions are important to a society?",
  "Do you think traditions should change over time, or stay the same?",
  "How has the internet changed the way people get news?",
  "Do you think social media is a reliable source of information?",
  "What are the advantages and disadvantages of living in a big city?",
  "Do you think public spaces like parks are important for a community?",
  "How do you think artificial intelligence will change everyday life?",
  "Do you think people rely too much on technology nowadays?",
];

async function main() {
  console.log("Deleting existing spinner_topics rows...");
  const { error: delError } = await supabase.from("spinner_topics").delete().neq("id", 0);
  if (delError) { console.error("Delete failed:", delError.message); process.exit(1); }

  const rows = [
    ...PART1.map((text) => ({ text, difficulty: "medium", category: "part1", language: "en" })),
    ...PART2.map((text) => ({ text, difficulty: "medium", category: "part2", language: "en" })),
    ...PART3.map((text) => ({ text, difficulty: "medium", category: "part3", language: "en" })),
  ];

  console.log(`Inserting ${rows.length} IELTS Speaking questions...`);
  const { error } = await supabase.from("spinner_topics").insert(rows);
  if (error) { console.error("Insert failed:", error.message); process.exit(1); }

  console.log(`Done. Part 1: ${PART1.length}, Part 2: ${PART2.length}, Part 3: ${PART3.length}, total: ${rows.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
