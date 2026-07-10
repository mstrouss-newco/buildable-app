// /api/generate-question-bank.js
// ==================================================================
// The weekly QUESTION FACTORY (Session 8A). Generates a balanced batch of
// curriculum-mapped practice questions and writes them into question_bank as
// status='pending'. Nothing here is ever shown to a kid: the review gate (a
// grown-up approving on /question-review) is what promotes a question to
// 'approved'. Serving of approved questions lives in generate-quiz.js.
//
// Trigger: a weekly Vercel Cron hits GET /api/generate-question-bank (see
// vercel.json "crons"). Target volume: ~50 reviewed questions per week, so we
// generate ~50 pending candidates per run (de-duped by content_hash).
//
// Manual / QA:
//   GET  /api/generate-question-bank?dry=1            -> generate + return, DO NOT write
//   GET  /api/generate-question-bank?limit=10         -> smaller batch
//   GET  /api/generate-question-bank?local=1          -> only local (no model) subjects
//   GET  /api/generate-question-bank?theme=space      -> theme every question to a game
//   POST { limit, dry, local, theme }                 -> same, via body
//
// Safety: dormant (ok:false) if SUPABASE env is unset. If CRON_SECRET is set,
// callers must send Authorization: Bearer <CRON_SECRET> (Vercel Cron does this
// automatically). No emojis anywhere (product rule).
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (required to write); ANTHROPIC_API_KEY
//      (needed for spelling/reading/advanced skills); CRON_SECRET (optional).
// ==================================================================
import { generationTargets } from "./_curriculum.js";
import { bankContentHash, makeQuestion } from "./_quizgen.js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}

// Insert a batch of pending rows; ignore-duplicates lets content_hash de-dupe.
async function insertPending(rows) {
  if (!rows.length) return 0;
  try {
    const r = await fetch(`${URL}/rest/v1/question_bank`, {
      method: "POST",
      headers: { ...H, Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(rows),
    });
    if (!r.ok) return 0;
    const back = await r.json().catch(() => []);
    return Array.isArray(back) ? back.length : 0;
  } catch { return 0; }
}

async function logRun(fields) {
  try {
    await fetch(`${URL}/rest/v1/question_bank_runs`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(fields),
    });
  } catch {}
}

// Generate `targets` in small concurrent waves so a run stays fast and within
// the function time budget. Returns { made:[{target,payload,source}], failed }.
async function generateAll(targets, anthropicKey, wave = 6) {
  const made = [];
  let failed = 0;
  for (let i = 0; i < targets.length; i += wave) {
    const slice = targets.slice(i, i + wave);
    const results = await Promise.all(slice.map((t) => makeQuestion(t, anthropicKey).catch(() => null)));
    results.forEach((res, j) => {
      if (res && res.payload) made.push({ target: slice[j], ...res });
      else failed++;
    });
  }
  return { made, failed };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // Cron auth (only enforced when a secret is configured).
  if (CRON_SECRET) {
    const a = req.headers.authorization || req.headers.Authorization || "";
    if (a !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ ok: false, reason: "unauthorized" });
  }

  const q = req.query || {};
  const body = req.method === "POST" ? await readBody(req) : {};
  const pick = (k, d) => (q[k] != null ? q[k] : body[k] != null ? body[k] : d);
  const dry = String(pick("dry", "")) === "1" || pick("dry", false) === true;
  const localOnly = String(pick("local", "")) === "1" || pick("local", false) === true;
  const limit = Math.max(1, Math.min(200, parseInt(pick("limit", 50), 10) || 50));
  const gameTheme = pick("theme", null) || null;

  // Build the balanced target list. local=1 restricts to subjects we can build
  // without a model, so QA can run anywhere (no keys needed).
  const opts = localOnly ? { subjects: ["math", "geometry"] } : {};
  let targets = generationTargets(limit, opts);
  if (gameTheme) targets = targets.map((t) => ({ ...t, gameTheme }));

  const { made, failed } = await generateAll(targets, localOnly ? null : ANTHROPIC_KEY);

  // Tag rows for the bank and de-dupe within this batch by content_hash.
  const seen = new Set();
  const rows = [];
  const bySource = {};
  const bySubject = {};
  for (const m of made) {
    const hash = bankContentHash(m.payload);
    if (seen.has(hash)) continue;
    seen.add(hash);
    bySource[m.source] = (bySource[m.source] || 0) + 1;
    bySubject[m.target.subject] = (bySubject[m.target.subject] || 0) + 1;
    rows.push({
      grade: m.target.grade || null,
      subject: m.target.subject,
      skill: m.target.skill || m.payload.skill || null,
      quiz_type: m.target.quizType,
      payload: m.payload,
      source: m.source === "local" ? "local" : "ai",
      status: "pending",
      game_theme: gameTheme || null,
      content_hash: hash,
    });
  }

  const summary = {
    ok: true,
    dry,
    requested: targets.length,
    generated: rows.length,
    failed,
    bySubject,
    bySource,
    theme: gameTheme || undefined,
  };

  if (dry) {
    summary.sample = rows.slice(0, 3).map((r) => ({ grade: r.grade, subject: r.subject, skill: r.skill, source: r.source, question: r.payload.question || r.payload.clue || r.payload.story }));
    return res.status(200).json(summary);
  }

  if (!URL || !KEY) return res.status(200).json({ ...summary, ok: false, reason: "no supabase env; nothing written" });

  const inserted = await insertPending(rows);
  summary.inserted = inserted;
  summary.duplicates = rows.length - inserted;
  await logRun({ requested: targets.length, generated: rows.length, inserted, by_source: bySource, note: gameTheme ? `theme=${gameTheme}` : null });
  return res.status(200).json(summary);
}
