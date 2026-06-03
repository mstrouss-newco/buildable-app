// /api/generate-quiz.js
// Uses Claude to generate kid-appropriate quiz questions.
// Two quiz types: "spelling" (picture-based, no ambiguity), "reading" (short story + comprehension).
//
// Environment variables:
//   ANTHROPIC_API_KEY     — your Anthropic API key
//   SUPABASE_URL          — for caching
//   SUPABASE_SERVICE_KEY  — for caching

import crypto from "crypto";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001"; // small/fast model — quiz gen doesn't need bigness

function quizCacheKey({ age, level, gameType, quizType, seedBucket }) {
  // Bucket by hour so each age/quizType gets fresh-ish questions but we still cache hard
  return crypto.createHash("sha256").update(
    `${age}|${level}|${gameType}|${quizType}|${seedBucket}`
  ).digest("hex").slice(0, 16);
}

async function checkCache(supabaseUrl, supabaseKey, key) {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/quiz_cache?cache_key=eq.${key}&select=payload`, {
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0]?.payload || null;
  } catch (e) { return null; }
}

async function saveCache(supabaseUrl, supabaseKey, key, payload) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/quiz_cache`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates",
      },
      body: JSON.stringify({ cache_key: key, payload }),
    });
  } catch (e) {}
}

function buildSpellingPrompt(age, level) {
  return `You are creating a spelling question for a child age ${age}, level ${level}.

The question should be UNAMBIGUOUS — meaning only ONE of the offered choices makes a real, common English word.

Rules:
1. Pick a simple, age-appropriate word with ONE letter missing
2. Choose an emoji that clearly represents the word
3. Give 4 letter choices where ONLY ONE forms a real common word
4. Avoid: words that share letter patterns (cat/bat/hat all valid for _AT)

Bad example: _AT with choices [B, C, H, F] — all form valid words (bat, cat, hat, fat)
Good example: D_G with emoji "🐕" and choices [O, A, E, U] — only O makes "dog"
Good example: _UN with emoji "☀️" and choices [S, B, R, G] — only S makes "sun" (the picture is the sun)

Return ONLY raw JSON, no other text, no markdown:
{
  "type": "spelling",
  "emoji": "🐕",
  "word_template": "D_G",
  "choices": ["O", "A", "E", "U"],
  "correctIndex": 0,
  "answer": "dog"
}`;
}

function buildReadingPrompt(age, level) {
  return `You are creating a short reading comprehension question for a child age ${age}, level ${level}.

Rules:
1. Write a 2-3 sentence story appropriate for the age
2. Ask ONE simple comprehension question about it
3. Give 4 answer choices where ONE is obviously correct from the story
4. Use friendly, positive content — no scary themes, no violence, no sad themes
5. Story should be 25-50 words

Return ONLY raw JSON, no other text, no markdown:
{
  "type": "reading",
  "story": "Maya found a tiny blue bird in her garden. The bird had hurt its wing. Maya brought it inside and made a soft nest with a towel.",
  "question": "What did Maya make for the bird?",
  "choices": ["a soft nest", "a song", "a sandwich", "a kite"],
  "correctIndex": 0
}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { age = 7, level = 1, gameType = "runner", quizType = "spelling" } = req.body || {};

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey) {
    return res.status(200).json({ fallback: true });
  }

  // Cache key with a 1-hour bucket so we rotate questions but reuse heavily
  const seedBucket = Math.floor(Date.now() / (1000 * 60 * 60));
  const key = quizCacheKey({ age, level, gameType, quizType, seedBucket });

  if (supabaseUrl && supabaseKey) {
    const cached = await checkCache(supabaseUrl, supabaseKey, key);
    if (cached) return res.status(200).json({ ...cached, cached: true });
  }

  const prompt = quizType === "reading"
    ? buildReadingPrompt(age, level)
    : buildSpellingPrompt(age, level);

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Claude error:", errText);
      return res.status(200).json({ fallback: true, error: "claude_failed" });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || "";
    const cleaned = text.replace(/```json|```/g, "").trim();

    let payload;
    try {
      payload = JSON.parse(cleaned);
    } catch (e) {
      console.error("Quiz JSON parse failed:", cleaned);
      return res.status(200).json({ fallback: true, error: "json_parse_failed" });
    }

    // Validate structure
    if (!payload.choices || !Array.isArray(payload.choices) || typeof payload.correctIndex !== "number") {
      return res.status(200).json({ fallback: true, error: "invalid_structure" });
    }

    // Cache
    if (supabaseUrl && supabaseKey) {
      await saveCache(supabaseUrl, supabaseKey, key, payload);
    }

    return res.status(200).json(payload);
  } catch (e) {
    console.error("generate-quiz error:", e);
    return res.status(200).json({ fallback: true, error: e.message });
  }
}
