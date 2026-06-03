// /api/generate-quiz.js
import crypto from "crypto";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
function quizCacheKey({ age, level, gameType, quizType, seedBucket }) {
return crypto.createHash("sha256").update(`${age}|${level}|${gameType}|${quizType}|${seedBucket}`).digest("hex").slice(0, 16);
}
async function checkCache(supabaseUrl, supabaseKey, key) {
try {
const r = await fetch(`${supabaseUrl}/rest/v1/quiz_cache?cache_key=eq.${key}&select=payload`, {headers: {"apikey": supabaseKey,"Authorization": `Bearer ${supabaseKey}`}});
if (!r.ok) return null;
const rows = await r.json();
return rows[0]?.payload || null;
} catch (e) { return null; }
}
async function saveCache(supabaseUrl, supabaseKey, key, payload) {
try {
await fetch(`${supabaseUrl}/rest/v1/quiz_cache`, {method: "POST",headers: {"apikey": supabaseKey,"Authorization": `Bearer ${supabaseKey}`,"Content-Type": "application/json","Prefer": "resolution=ignore-duplicates"},body: JSON.stringify({cache_key: key, payload})});
} catch (e) {}
}
function buildSpellingPrompt(age, level) {
return `You are creating a spelling question for a child age ${age}, level ${level}. The question should be UNAMBIGUOUS. Return ONLY raw JSON: {"type":"spelling","emoji":"🐕","word_template":"D_G","choices":["O","A","E","U"],"correctIndex":0,"answer":"dog"}`;
}
function buildReadingPrompt(age, level) {
return `You are creating a short reading comprehension question for a child age ${age}, level ${level}. Return ONLY raw JSON: {"type":"reading","story":"Maya found a tiny blue bird in her garden.","question":"Where did Maya find the bird?","choices":["garden","school","park","store"],"correctIndex":0}`;
}
export default async function handler(req, res) {
if (req.method !== "POST") return res.status(405).json({error: "POST only"});
const {age = 7, level = 1, gameType = "runner", quizType = "spelling"} = req.body || {};
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicKey) return res.status(200).json({fallback: true});
const seedBucket = Math.floor(Date.now() / (1000 * 60 * 60));
const key = quizCacheKey({age, level, gameType, quizType, seedBucket});
if (supabaseUrl && supabaseKey) {
const cached = await checkCache(supabaseUrl, supabaseKey, key);
if (cached) return res.status(200).json({...cached, cached: true});
}
const prompt = quizType === "reading" ? buildReadingPrompt(age, level) : buildSpellingPrompt(age, level);
try {
const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {method: "POST",headers: {"x-api-key": anthropicKey,"anthropic-version": "2023-06-01","Content-Type": "application/json"},body: JSON.stringify({model: CLAUDE_MODEL,max_tokens: 500,messages: [{role: "user", content: prompt}]})});
if (!claudeRes.ok) {const errText = await claudeRes.text();console.error("Claude error:", errText);return res.status(200).json({fallback: true, error: "claude_failed"});}
const claudeData = await claudeRes.json();
const text = claudeData.content?.[0]?.text || "";
const cleaned = text.replace(/```json|```/g, "").trim();
let payload;
try {payload = JSON.parse(cleaned);} catch (e) {return res.status(200).json({fallback: true, error: "json_parse_failed"});}
if (!payload.choices || !Array.isArray(payload.choices) || typeof payload.correctIndex !== "number") return res.status(200).json({fallback: true, error: "invalid_structure"});
if (supabaseUrl && supabaseKey) await saveCache(supabaseUrl, supabaseKey, key, payload);
return res.status(200).json(payload);
} catch (e) {
console.error("generate-quiz error:", e);
return res.status(200).json({fallback: true, error: e.message});
}
}
