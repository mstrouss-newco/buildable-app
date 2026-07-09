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
  return { type: "math", question, choices, correctIndex, skill: useSub ? "subtraction-within-20" : "addition-within-20", local: true };
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
  return { type: "geometry", question, choices, correctIndex, skill: "shape-sides", local: true };
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
  return { type: "spelling", clue: `This word means: ${word}.`, word_template: template, choices, correctIndex, answer: word, skill: "spelling-fill", local: true };
}

function buildReadingLocal() {
  const story = "Maya found a tiny blue bird in her garden.";
  const question = "Where did Maya find the bird?";
  const { choices, correctIndex } = shuffleWithCorrect("garden", ["school", "park", "store"]);
  return { type: "reading", story, question, choices, correctIndex, skill: "reading-comprehension", local: true };
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

// ---------------- Curriculum-tagged question bank (Session 6B) ----------------
// The bank is a REVIEWED pool: only status='approved' rows are ever served, and
// AI-generated questions enter as status='pending' (the review gate). Serving
// prefers a bank question that matches the kid's grade/subject/skill (adaptive:
// the caller passes the kid's recently-missed skill), and only falls back to
// on-the-fly generation when the bank has nothing suitable. See db/6b-question-bank.sql.
const QUIZ_SUBJECT = { math: "math", geometry: "geometry", spelling: "spelling", reading: "reading" };

function bankContentHash(payload) {
  const basis = [payload.type, payload.question, payload.story, payload.clue, payload.word_template, (payload.choices || []).join("|")].join("~");
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

// Pull ONE approved bank question, biased to `skill` when given (adaptive).
async function fetchBankQuestion(url, key, { subject, grade, skill }) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const base = `${url}/rest/v1/question_bank?status=eq.approved&subject=eq.${encodeURIComponent(subject)}&select=id,payload,grade,skill&limit=40`;
  const gradeFilter = grade ? `&grade=eq.${encodeURIComponent(grade)}` : "";
  async function tryUrl(u) {
    try {
      const r = await fetch(u, { headers });
      if (!r.ok) return null;
      const rows = await r.json();
      return Array.isArray(rows) && rows.length ? rows : null;
    } catch (e) { return null; }
  }
  // 1) skill + grade match (most adaptive), 2) grade match, 3) subject only.
  let rows = null;
  if (skill) rows = await tryUrl(base + gradeFilter + `&skill=eq.${encodeURIComponent(skill)}`);
  if (!rows) rows = await tryUrl(base + gradeFilter);
  if (!rows && grade) rows = await tryUrl(base);
  if (!rows) return null;
  const pick = rows[Math.floor(Math.random() * rows.length)];
  const payload = pick.payload || null;
  if (!payload) return null;
  return { ...payload, source: "bank", questionId: pick.id };
}

// Write an AI-generated question into the bank as PENDING (review gate). Never
// served until a grown-up approves it. De-duped on content_hash.
async function insertBankPending(url, key, { grade, subject, skill, quiz_type, payload }) {
  try {
    await fetch(`${url}/rest/v1/question_bank`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ grade: grade || null, subject, skill: skill || null, quiz_type, payload, source: "ai", status: "pending", content_hash: bankContentHash(payload) }),
    });
  } catch (e) {}
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { age = 7, level = 1, gameType = "runner", quizType = "spelling", grade = null, skill = null } = req.body || {};
  const subject = QUIZ_SUBJECT[quizType] || "math";

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // Bank FIRST: an approved, curriculum-matched question (adaptive to the kid's
  // recently-missed skill) beats on-the-fly generation. Silent fallback if none.
  if (supabaseUrl && supabaseKey) {
    const banked = await fetchBankQuestion(supabaseUrl, supabaseKey, { subject, grade, skill });
    if (banked) return res.status(200).json(banked);
  }

  // Math and geometry are deterministic-local: instant and never need the API.
  if (quizType === "math" || quizType === "geometry") {
    return res.status(200).json(localFallback(quizType, age, level));
  }

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
    if (!payload.skill) payload.skill = quizType === "reading" ? "reading-comprehension" : "spelling-fill";
    if (supabaseUrl && supabaseKey) {
      await saveCache(supabaseUrl, supabaseKey, key, payload);
      // Review gate: the fresh AI question ENTERS the bank as pending (never
      // served from the bank until a grown-up approves it). The kid still gets
      // this freshly-generated, safety-checked question right now.
      await insertBankPending(supabaseUrl, supabaseKey, { grade, subject, skill: payload.skill, quiz_type: quizType, payload });
    }
    return res.status(200).json(payload);
  } catch (e) {
    console.error("generate-quiz error:", e);
    return res.status(200).json(localFallback(quizType, age, level));
  }
}
