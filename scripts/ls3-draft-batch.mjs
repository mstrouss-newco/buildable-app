// scripts/ls3-draft-batch.mjs  (Session LS3)
// Runs the lesson factory's AUTHORED engine offline, so the first Math batch can
// be checked and loaded without spending a model call or hitting production.
// It uses the SAME code paths /api/generate-lessons uses in production
// (targetsFromMap + makeLesson + validateLesson), so what you see here is
// exactly what the endpoint would write.
//
//   node scripts/ls3-draft-batch.mjs                 -> report only
//   node scripts/ls3-draft-batch.mjs --sql out.sql   -> also write insert SQL
//   node scripts/ls3-draft-batch.mjs --json out.json -> also dump the lessons
//   node scripts/ls3-draft-batch.mjs --grade k --subject math --limit 10
import fs from "fs";
import { makeLesson, lessonContentHash } from "../api/_lessongen.js";
import { targetsFromMap } from "../api/generate-lessons.js";
import { skillsFor } from "../api/_curriculum.js";

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : d; };
const grade = arg("grade", "k");
const subject = arg("subject", "math");
const limit = parseInt(arg("limit", "10"), 10);
const sqlOut = arg("sql", "");
const jsonOut = arg("json", "");

const map = JSON.parse(fs.readFileSync("public/lessons/index.json", "utf8"));
let targets = targetsFromMap(map)
  .filter((t) => !t.hasFile)
  .filter((t) => (grade ? String(t.grade) === grade : true))
  .filter((t) => (subject ? t.pathSubject === subject : true));

const off = targets.filter((t) => !skillsFor(t.grade, t.subject).includes(t.skill));
targets = targets.filter((t) => skillsFor(t.grade, t.subject).includes(t.skill)).slice(0, limit);

console.log(`targets: ${targets.length}${off.length ? `  (off-curriculum skipped: ${off.map((t) => t.key).join(", ")})` : ""}`);

const made = [];
let failed = 0;
for (const t of targets) {
  const r = await makeLesson(t, null); // null key = authored engine only
  if (r.ok) {
    made.push(r);
    const L = r.lesson;
    console.log(`  OK   ${L.id.padEnd(22)} ${String(L.title).padEnd(24)} teach:${L.teach.length} guided:${L.guided.length} check:${L.check.length} practice:${L.solo.fallback.length} [${r.source}]`);
  } else {
    failed++;
    console.log(`  FAIL ${t.key.padEnd(22)} ${r.reason}`);
    (r.errors || []).forEach((e) => console.log(`         - ${e}`));
  }
}
console.log(`\ndrafted ${made.length}, failed ${failed}`);
if (failed) process.exitCode = 1;

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(made.map((m) => m.lesson), null, 2));
  console.log(`wrote ${jsonOut}`);
}

if (sqlOut) {
  // Dollar-quoted so no amount of apostrophes in the teaching text can break
  // the statement. status is hard-coded 'pending': this script cannot approve.
  const stmts = made.map((m) => {
    const L = m.lesson;
    const j = JSON.stringify(L);
    const q = (s) => `'${String(s == null ? "" : s).replace(/'/g, "''")}'`;
    return `insert into lesson_bank (lesson_key, grade, subject, skill, title, unit, minutes, payload, source, status, content_hash)
values (${q(L.id)}, ${q(L.grade)}, ${q(L.subject)}, ${q(L.skill)}, ${q(L.title)}, ${q(L.unit)}, ${L.minutes}, $lsn$${j}$lsn$::jsonb, ${q(m.source)}, 'pending', ${q(m.hash || lessonContentHash(L))})
on conflict (lesson_key) do nothing;`;
  });
  fs.writeFileSync(sqlOut, stmts.join("\n\n") + "\n");
  console.log(`wrote ${sqlOut} (${stmts.length} inserts)`);
}
