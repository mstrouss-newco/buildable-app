// /api/_quizgen.js
// -------------------------------------------------------------
// Shared question builders for the bank factory (Session 8A). These mirror the
// LOCAL generators in generate-quiz.js (kept there too so the live kid endpoint
// stays self-contained), plus a model-backed generator for skills that have no
// local builder. Used by api/generate-question-bank.js.
//
// content_hash MUST match generate-quiz.js's bankContentHash so the two writers
// de-dupe against each other. Do not change the basis without updating both.
// No emojis anywhere (product rule).
// -------------------------------------------------------------
import crypto from "crypto";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

export function bankContentHash(payload) {
  const basis = [payload.type, payload.question, payload.story, payload.clue, payload.word_template, (payload.choices || []).join("|")].join("~");
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

function shuffleWithCorrect(correct, distractors) {
  const pool = [];
  const seen = new Set();
  const push = (v) => { const s = String(v); if (!seen.has(s)) { seen.add(s); pool.push(s); } };
  push(correct);
  for (const d of distractors) { if (pool.length >= 4) break; push(d); }
  let guard = 0;
  while (pool.length < 4 && guard++ < 50) push(Number(correct) + guard * (guard % 2 ? 1 : -1));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return { choices: pool.slice(0, 4), correctIndex: pool.slice(0, 4).indexOf(String(correct)) };
}

const SHAPE_SIDES = [
  { name: "triangle", sides: 3 }, { name: "square", sides: 4 }, { name: "rectangle", sides: 4 },
  { name: "pentagon", sides: 5 }, { name: "hexagon", sides: 6 }, { name: "octagon", sides: 8 },
];

// ---- LOCAL builders, keyed by skill. Return a payload or null. ----
export function localForSkill(skill) {
  switch (skill) {
    case "addition-within-5": return addition(5, skill);
    case "addition-within-20": return addition(20, skill);
    case "addition-within-100": return addition(100, skill);
    case "subtraction-within-20": return subtraction(20, skill);
    case "subtraction-within-100": return subtraction(100, skill);
    case "shape-sides": return shapeSides();
    case "shape-names": return shapeNames();
    default: return null;
  }
}

function addition(max, skill) {
  const a = Math.floor(Math.random() * max) + 1;
  const b = Math.floor(Math.random() * Math.max(1, max - a)) + 1;
  const answer = a + b;
  const { choices, correctIndex } = shuffleWithCorrect(answer, [answer + 1, answer - 1, answer + 2, answer + 10].filter((n) => n >= 0));
  return { type: "math", question: `What is ${a} + ${b}?`, choices, correctIndex, skill, local: true };
}

function subtraction(max, skill) {
  const hi = Math.floor(Math.random() * max) + 1;
  const lo = Math.floor(Math.random() * hi) + 0;
  const answer = hi - lo;
  const { choices, correctIndex } = shuffleWithCorrect(answer, [answer + 1, answer - 1, answer + 2, answer + 5].filter((n) => n >= 0));
  return { type: "math", question: `What is ${hi} - ${lo}?`, choices, correctIndex, skill, local: true };
}

function shapeSides() {
  const pick = SHAPE_SIDES[Math.floor(Math.random() * SHAPE_SIDES.length)];
  const { choices, correctIndex } = shuffleWithCorrect(pick.sides, [pick.sides + 1, pick.sides - 1, pick.sides + 2, pick.sides + 3].filter((n) => n > 0));
  return { type: "geometry", question: `How many sides does a ${pick.name} have?`, choices, correctIndex, skill: "shape-sides", local: true };
}

function shapeNames() {
  const pick = SHAPE_SIDES[Math.floor(Math.random() * SHAPE_SIDES.length)];
  const others = SHAPE_SIDES.filter((s) => s.name !== pick.name).map((s) => s.name);
  const distractors = [];
  while (distractors.length < 3 && others.length) distractors.push(others.splice(Math.floor(Math.random() * others.length), 1)[0]);
  const { choices, correctIndex } = shuffleWithCorrect(pick.name, distractors);
  return { type: "geometry", question: `Which shape has ${pick.sides} sides?`, choices, correctIndex, skill: "shape-names", local: true };
}

// ---- Model-backed generator for any skill (spelling, reading, advanced math). ----
// Returns a validated payload or null. Never throws.
export async function claudeForSkill({ grade, subject, quizType, skill, gameTheme, anthropicKey }) {
  if (!anthropicKey) return null;
  const themeLine = gameTheme ? ` Theme the question around a "${gameTheme}" setting so it feels part of that game.` : "";
  const gradeLabel = grade === "k" ? "kindergarten" : `grade ${grade}`;
  const shapeByType = {
    math: `{"type":"math","question":"...","choices":["..","..","..",".."],"correctIndex":0,"skill":"${skill}"}`,
    geometry: `{"type":"geometry","question":"...","choices":["..","..","..",".."],"correctIndex":0,"skill":"${skill}"}`,
    spelling: `{"type":"spelling","clue":"A pet that barks.","word_template":"D_G","choices":["O","A","E","U"],"correctIndex":0,"answer":"dog","skill":"${skill}"}`,
    reading: `{"type":"reading","story":"Maya found a tiny blue bird in her garden.","question":"Where did Maya find the bird?","choices":["garden","school","park","store"],"correctIndex":0,"skill":"${skill}"}`,
  };
  const shape = shapeByType[quizType] || shapeByType.math;
  const prompt = `You are writing ONE multiple-choice practice question for a ${gradeLabel} child. Subject: ${subject}. Skill to practice: ${skill}.${themeLine} The question must be unambiguous and age-appropriate, exactly one correct answer, no emoji or symbols. Return ONLY raw JSON in this exact shape: ${shape}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = data.content?.[0]?.text || "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    let payload;
    try { payload = JSON.parse(cleaned); } catch { return null; }
    if (!payload || !Array.isArray(payload.choices) || payload.choices.length < 2 || typeof payload.correctIndex !== "number") return null;
    if (payload.correctIndex < 0 || payload.correctIndex >= payload.choices.length) return null;
    if ("emoji" in payload) delete payload.emoji;
    if (!payload.type) payload.type = quizType;
    if (!payload.skill) payload.skill = skill;
    return payload;
  } catch { return null; }
}

// Make one question for a target: local if we have a builder, else the model.
export async function makeQuestion(target, anthropicKey) {
  const { skill, quizType, grade, subject, gameTheme } = target;
  const local = localForSkill(skill);
  if (local) return { payload: local, source: "local" };
  const payload = await claudeForSkill({ grade, subject, quizType, skill, gameTheme, anthropicKey });
  return payload ? { payload, source: "ai" } : null;
}

export default { bankContentHash, localForSkill, claudeForSkill, makeQuestion };
