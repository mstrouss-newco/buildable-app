// qa-question-bank.mjs — Session 8A verification (no network, no keys needed).
// Checks the curriculum map, the local question builders, and the factory's
// dry-run so we know the weekly generator is sound before it ships.
import { generationTargets, SUBJECTS, LOCALLY_GENERATED_SKILLS } from "./api/_curriculum.js";
import { localForSkill, bankContentHash } from "./api/_quizgen.js";
import factory from "./api/generate-question-bank.js";

let fail = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("pass:", m); };

function validPayload(p) {
  if (!p || !Array.isArray(p.choices) || p.choices.length < 2) return false;
  if (typeof p.correctIndex !== "number" || p.correctIndex < 0 || p.correctIndex >= p.choices.length) return false;
  if (new Set(p.choices.map(String)).size !== p.choices.length) return false; // no dup choices
  if (!p.type) return false;
  return true;
}

// 1) curriculum balance
const t = generationTargets(50);
ok(t.length === 50, "generationTargets(50) returns 50 targets");
const subs = new Set(t.map((x) => x.subject));
ok(SUBJECTS.every((s) => subs.has(s)), "all 4 subjects represented in a weekly batch");

// 2) every locally-generated skill builds a valid, unambiguous question
for (const skill of LOCALLY_GENERATED_SKILLS) {
  let good = true;
  for (let i = 0; i < 30; i++) { if (!validPayload(localForSkill(skill))) { good = false; break; } }
  ok(good, `local builder valid over 30 draws: ${skill}`);
}

// 3) content hash is stable + shape as expected (24 hex chars)
const h = bankContentHash(localForSkill("addition-within-20"));
ok(/^[0-9a-f]{24}$/.test(h), "bankContentHash is 24 hex chars");

// 4) factory dry-run (local only, no keys) returns well-formed rows
const res = { _c: 0, _o: null, setHeader() {}, status(c) { this._c = c; return this; }, json(o) { this._o = o; return this; } };
await factory({ method: "GET", query: { dry: "1", local: "1", limit: "20" }, headers: {} }, res);
ok(res._c === 200 && res._o && res._o.ok, "factory dry-run responds ok");
ok(res._o.generated > 0, "factory dry-run generated at least one question");
ok((res._o.sample || []).every((s) => s.question), "factory dry-run samples carry a question");

// 5) auth: with a CRON_SECRET set, an unauthorized call is rejected
process.env.CRON_SECRET = "test-secret";
const mod = await import("./api/generate-question-bank.js?auth=1");
const r2 = { _c: 0, _o: null, setHeader() {}, status(c) { this._c = c; return this; }, json(o) { this._o = o; return this; } };
await mod.default({ method: "GET", query: { dry: "1", local: "1" }, headers: {} }, r2);
ok(r2._c === 401, "factory rejects unauthorized call when CRON_SECRET is set");
delete process.env.CRON_SECRET;

console.log(fail ? `\nQA FAILED (${fail})` : "\nQA PASSED");
process.exit(fail ? 1 : 0);
