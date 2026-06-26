// /api/generate-quiz.js
// -------------------------------------------------------------
// Quick-question generator for Learning Mode.
//
// quizType: "math" | "geometry" | "spelling" | "reading"
//   - math / geometry are generated LOCALLY (no model call) so they are
//     instant and never depend on the API being reachable.
//   - spelling / reading use Claude Haiku (cached in Supabase quiz_cache),
//     with a safe LOCAL fallback so a child is never hard-blocked.
//
// Response shape (backward compatible): { type, choices[], correctIndex, ... }
// NOTE: the old "emoji" clue field has been removed product-wide. Spelling now
// uses a plain text/word clue ("clue") instead of an emoji.
// -------------------------------------------------------------
import crypto from "crypto";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

function quizCacheKey({ age, level, gameType, quizType, seedBucket }) {
  return crypto
    .createHash("sha256")
    .update(`${age}|${level}|${gameType}|${quizType}|${seedBucket}`)
    .digest("hex")
    .slice(0, 16);
}

async function checkCache(supabaseUrl, supabaseKey, key) {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/quiz_cache?cache_key=eq.${key}&select=payload`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0]?.payload || null;
  } catch (e) {
    return null;
  }
}

async function saveCache(supabaseUrl, supabaseKey, key, payload) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/quiz_cache`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates",
      },
      body: JSON.stringify({ cache_key: key, payload }),
    });
  } catch (e) {}
}

// ---------------- Local generators (no model, always available) ----------------
function shuffleWithCorrect(correct, distractors) {
  // Build a 4-option set, keep it unique, then place the correct value and
  // report its index after shuffling.
  const pool = [];
  const seen = new Set();
  const push = (v) => {
    const s = String(v);
    if (!seen.has(s)) { seen.add(s); pool.push(s); }
  };
  push(correct);
  for (const d of distractors) { if (pool.length >= 4) break; push(d); }
  let guard = 0;
  while (pool.length < 4 && guard++ < 50) push(Number(correct) + (guard * (guard % 2 ? 1 : -1)));
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { choices: pool.slice(0, 4), correctIndex: pool.slice(0, 4).indexOf(String(correct)) };
}

function buildMathLocal(age, level) {
  // Range grows with level: level 1 -> single digits, higher -> bigger numbers.
  const lvl = Math.max(1, Number(level) || 1);
  const max = Math.min(20, 4 + lvl * 3);
  const a = Math.floor(Math.random() * max) + 1;
  const b = Math.floor(Math.random() * max) + 1;
  // Subtraction once numbers get bigger; keep results non-negative.
  const useSub = lvl >= 3 && Math.random() < 0.5;
  let question, answer;
  if (useSub) {
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    question = `What is ${hi} - ${lo}?`;
    answer = hi - lo;
  } else {
    question = `What is ${a} + ${b}?`;
    answer = a + b;
  }
  const distractors = [answer + 1, answer - 1, answer + 2, answer + 10].filter((n) => n >= 0);
  const { choices, correctIndex } = shuffleWithCorrect(answer, distractors);
  return { type: "math", question, choices, correctIndex, local: true };
}

const SHAPE_SIDES = [
  { name: "triangle", sides: 3 },
  { name: "square", sides: 4 },
  { name: "rectangle", sides: 4 },
  { name: "pentagon", sides: 5 },
  { name: "hexagon", sides: 6 },
  { name: "octagon", sides: 8 },
];

function buildGeometryLocal() {
  const pick = SHAPE_SIDES[Math.floor(Math.random() * SHAPE_SIDES.length)];
  const question = `How many sides does a ${pick.name} have?`;
  const distractors = [pick.sides + 1, pick.sides - 1, pick.sides + 2, pick.sides + 3].filter((n) => n > 0);
  const { choices, correctIndex } = shuffleWithCorrect(pick.sides, distractors);
  return { type: "geometry", question, choices, correctIndex, local: true };
}

// Tiny offline word bank so spelling/reading still works if the model is down.
const SPELLING_WORDS = ["cat", "dog", "sun", "tree", "fish", "star", "bird", "frog", "moon", "boat"];
function buildSpellingLocal() {
  const word = SPELLING_WORDS[Math.floor(Math.random() * SPELLING_WORDS.length)];
  const idx = 1; // hide the second letter
  const missing = word[idx].toUpperCase();
  const template = word
    .split("")
    .map((ch, i) => (i === idx ? "_" : ch.toUpperCase()))
    .join("");
  const others = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").filter((c) => c !== missing);
  const distractors = [];
  while (distractors.length < 3) {
    const c = others[Math.floor(Math.random() * others.length)];
    if (!distractors.includes(c)) distractors.push(c);
  }
  const { choices, correctIndex } = shuffleWithCorrect(missing, distractors);
  return { type: "spelling", clue: `This word means: ${word}.`, word_template: template, choices, correctIndex, answer: word, local: true };
}

function buildReadingLocal() {
  const story = "Maya found a tiny blue bird in her garden.";
  const question = "Where did Maya find the bird?";
  const { choices, correctIndex } = shuffleWithCorrect("garden", ["school", "park", "store"]);
  return { type: "reading", story, question, choices, correctIndex, local: true };
}

function localFallback(quizType, age, level) {
  switch (quizType) {
    case "math": return buildMathLocal(age, level);
    case "geometry": return buildGeometryLocal();
    case "reading": return buildReadingLocal();
    case "spelling":
    default: return buildSpellingLocal();
  }
}

// ---------------- Claude prompts (no emojis) ----------------
function buildSpellingPrompt(age, level) {
  return `You are creating a spelling question for a child age ${age}, level ${level}. The question must be UNAMBIGUOUS. Give a short plain-text clue describing the word (no emoji, no symbols). Return ONLY raw JSON in this exact shape: {"type":"spelling","clue":"A pet that barks.","word_template":"D_G","choices":["O","A","E","U"],"correctIndex":0,"answer":"dog"}`;
}

function buildReadingPrompt(age, level) {
  return `You are creating a short reading comprehension question for a child age ${age}, level ${level}. Do not use emoji or symbols. Return ONLY raw JSON: {"type":"reading","story":"Maya found a tiny blue bird in her garden.","question":"Where did Maya find the bird?","choices":["garden","school","park","store"],"correctIndex":0}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { age = 7, level = 1, gameType = "runner", quizType = "spelling" } = req.body || {};

  // Math and geometry are deterministic-local: instant and never need the API.
  if (quizType === "math" || quizType === "geometry") {
    return res.status(200).json(localFallback(quizType, age, level));
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // No model key -> safe local fallback instead of a dead end.
  if (!anthropicKey) return res.status(200).json(localFallback(quizType, age, level));

  const seedBucket = Math.floor(Date.now() / (1000 * 60 * 60));
  const key = quizCacheKey({ age, level, gameType, quizType, seedBucket });
  if (supabaseUrl && supabaseKey) {
    const cached = await checkCache(supabaseUrl, supabaseKey, key);
    if (cached) return res.status(200).json({ ...cached, cached: true });
  }

  const prompt = quizType === "reading" ? buildReadingPrompt(age, level) : buildSpellingPrompt(age, level);
  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Claude error:", errText);
      return res.status(200).json(localFallback(quizType, age, level));
    }
    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    let payload;
    try {
      payload = JSON.parse(cleaned);
    } catch (e) {
      return res.status(200).json(localFallback(quizType, age, level));
    }
    if (!payload.choices || !Array.isArray(payload.choices) || typeof payload.correctIndex !== "number") {
      return res.status(200).json(localFallback(quizType, age, level));
    }
    // Defensively drop any legacy emoji field if a cached/old response carries one.
    if ("emoji" in payload) delete payload.emoji;
    if (supabaseUrl && supabaseKey) await saveCache(supabaseUrl, supabaseKey, key, payload);
    return res.status(200).json(payload);
  } catch (e) {
    console.error("generate-quiz error:", e);
    return res.status(200).json(localFallback(quizType, age, level));
  }
}
