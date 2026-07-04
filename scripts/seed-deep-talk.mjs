// Seeds spinner_deep_talk with 100 self-reflection / philosophy-of-life
// conversation questions across 5 categories, for the new "Deep Talk" tab.
// Safe to re-run: skips entirely if the table already has rows.
//
// Run: node scripts/seed-deep-talk.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();
const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));

// ── self — identity, self-knowledge, personal growth ───────────────────────
const SELF = [
  "What does success actually mean to you, beyond money or job title?",
  "What's a belief you held for years but eventually changed your mind about?",
  "If you could master one skill instantly, what would it be and why?",
  "What part of your personality took the longest to accept?",
  "What's something you're proud of that most people don't know about?",
  "When do you feel most like yourself?",
  "What's a habit you've built that quietly changed your life?",
  "How do you know when you're truly happy, versus just distracted?",
  "What would you do differently if no one was watching or judging you?",
  "What's a compliment you received that stuck with you for years?",
  "What does being a 'good person' mean to you in practice, not theory?",
  "What's something you used to be embarrassed about that you now feel proud of?",
  "How has your definition of freedom changed as you've gotten older?",
  "What's a lesson you had to learn the hard way?",
  "If you had to describe yourself in one sentence, with no room for humility, what would you say?",
  "What's something you do that you can't fully explain to other people?",
  "What does it mean to truly know yourself?",
  "What's a fear you've overcome, and how did it change you?",
  "What part of your daily routine reflects your values the most?",
  "What would your younger self be surprised to learn about who you've become?",
];

// ── relationships — connection, love, friendship, trust ────────────────────
const RELATIONSHIPS = [
  "What does it mean to truly listen to someone?",
  "What's a quality you value more in people as you've gotten older?",
  "How do you know when you can really trust someone?",
  "What's the difference between being alone and being lonely?",
  "What's a moment when someone showed up for you in a way you didn't expect?",
  "What do you think makes a friendship last for decades?",
  "How do you handle it when someone you love disappoints you?",
  "What's something you wish people understood about how you show love?",
  "What does it mean to truly forgive someone?",
  "What's a conversation that changed the way you see a relationship in your life?",
  "How has your idea of romantic love changed over time?",
  "What's something small that someone does that makes you feel deeply cared for?",
  "What's a boundary you had to learn to set, and what did it teach you?",
  "How do you tell the difference between loving someone and needing them?",
  "What's the hardest kind of honesty to have in a relationship?",
  "What do you think people misunderstand most about vulnerability?",
  "What's a piece of advice about relationships you'd give your younger self?",
  "How do you rebuild trust after it's been broken?",
  "What does unconditional support look like to you, practically?",
  "What's something you've learned from a relationship that ended?",
];

// ── purpose — goals, meaning, ambition, direction in life ───────────────────
const PURPOSE = [
  "What would you do with your life if money were never a factor?",
  "What's a goal you're chasing that you've never told anyone about?",
  "How do you decide what's actually worth your time?",
  "What does a meaningful life look like to you, specifically?",
  "What's something you want to be remembered for?",
  "How do you know the difference between ambition and pressure from others?",
  "What's a dream you gave up on, and do you regret it?",
  "What would you regret not trying, even if you knew you might fail?",
  "How has what motivates you changed since you were a teenager?",
  "What's a risk you're glad you took?",
  "If you had five years left to live in good health, what would you change?",
  "What does 'enough' mean to you — money, achievement, recognition?",
  "What's something you keep postponing that actually matters to you?",
  "How do you want to be described by people who worked closely with you?",
  "What's a sign that you're on the right path, even when things are hard?",
  "What legacy, if any, do you want to leave behind?",
  "What's something you've built or created that you're genuinely proud of?",
  "How do you stay motivated when progress is slow or invisible?",
  "What would you tell someone who feels like they've wasted their twenties?",
  "What does it mean to live life on your own terms?",
];

// ── fears — anxiety, uncertainty, mortality, vulnerability ──────────────────
const FEARS = [
  "What's something you're afraid of that you've never told anyone?",
  "What does failure actually feel like for you, physically or mentally?",
  "What's a fear that used to control you but doesn't anymore?",
  "How do you deal with uncertainty about the future?",
  "What's the worst-case scenario you've imagined that never happened?",
  "What are you more afraid of — being alone or being misunderstood?",
  "How has your relationship with fear changed as you've gotten older?",
  "What's something you avoid because you're scared of what you'll discover?",
  "What does it mean to be brave, in your own definition?",
  "What's a moment you felt truly powerless, and how did you get through it?",
  "What do you think you're most afraid people will realize about you?",
  "How do you comfort yourself when you're anxious at 3am?",
  "What's a fear about aging that you don't often say out loud?",
  "What would you do if you knew you couldn't fail?",
  "How do you tell the difference between intuition and fear?",
  "What's something you're scared to want, because wanting it means you could lose it?",
  "What's the bravest thing you've ever done that no one applauded you for?",
  "How do you make peace with things you can't control?",
  "What does mortality make you think about most?",
  "What's a fear you inherited from a parent, and did you keep it?",
];

// ── philosophy — worldview, values, big questions about life ───────────────
const PHILOSOPHY = [
  "Do you think people can really change, or do they just get better at hiding who they are?",
  "What do you think happens after we die, if anything?",
  "Is it better to seek happiness or to seek meaning?",
  "Do you believe everything happens for a reason, or is that just a comforting story?",
  "What responsibility do we have to strangers versus people we know?",
  "Is honesty always the kindest option?",
  "Do you think most people are basically good, or basically self-interested?",
  "What matters more — intentions or outcomes?",
  "Is it possible to truly understand another person's experience?",
  "What do you think gives a life value — achievement, connection, or something else?",
  "Do you think free will exists, or are we shaped entirely by our circumstances?",
  "Is it better to know an uncomfortable truth or to live comfortably with a lie?",
  "What do you think humanity gets fundamentally wrong?",
  "Is suffering necessary for growth, or is that just something we tell ourselves after the fact?",
  "What do you think we owe future generations?",
  "Do you think technology is making us more connected or more isolated?",
  "Is morality objective, or does it depend entirely on culture and context?",
  "What's something society values that you personally think is overrated?",
  "Do you think it's possible to live without any regrets?",
  "What do you think is the point of struggle in a life well-lived?",
];

const CATEGORY_MAP = {
  self: SELF,
  relationships: RELATIONSHIPS,
  purpose: PURPOSE,
  fears: FEARS,
  philosophy: PHILOSOPHY,
};

async function main() {
  const { count } = await supabase.from("spinner_deep_talk").select("*", { count: "exact", head: true });
  if (count > 0) {
    console.log(`spinner_deep_talk already has ${count} rows, skipping.`);
    return;
  }

  const rows = Object.entries(CATEGORY_MAP).flatMap(([category, questions]) =>
    questions.map((text) => ({ text, category }))
  );

  console.log(`Inserting ${rows.length} Deep Talk questions...`);
  const { error } = await supabase.from("spinner_deep_talk").insert(rows);
  if (error) { console.error("Insert failed:", error.message); process.exit(1); }

  console.log("Done. Breakdown:", Object.fromEntries(
    Object.entries(CATEGORY_MAP).map(([k, v]) => [k, v.length])
  ));
}

main().catch((e) => { console.error(e); process.exit(1); });
