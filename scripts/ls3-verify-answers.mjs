// scripts/ls3-verify-answers.mjs  (Session LS3)
// An INDEPENDENT check on the answer key of every generated question. It does
// not trust the generator: it re-reads each question's wording, works the answer
// out from scratch, and compares. A lesson that teaches a wrong answer is the
// worst bug this product could ship, so this runs on every batch.
//
//   node scripts/ls3-verify-answers.mjs /tmp/ls3.json
//
// Facts it knows independently of the generator:
const SIDES = { circle: 0, triangle: 3, square: 4, rectangle: 4 };
const ROUND = new Set(["circle"]);
const REAL_WORLD = {
  wheel: "circle", "book cover": "rectangle", "roof point": "triangle", plate: "circle",
  "window pane": "square", "sail on a boat": "triangle", "phone screen": "rectangle",
  coin: "circle", bed: "rectangle", cracker: "square", "clock face": "circle", door: "rectangle",
};
const W2N = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };

import fs from "fs";
const lessons = JSON.parse(fs.readFileSync(process.argv[2] || "/tmp/ls3.json", "utf8"));

let checked = 0, bad = 0, unknown = 0;
const fail = (where, q, why) => { bad++; console.log(`  WRONG ${where}: "${q.question}" -> marked "${q.choices[q.correctIndex]}" but ${why}`); };

function expected(qt) {
  const q = qt.trim();
  let m;
  if ((m = /^(\d+)\s*\+\s*(\d+)\s*=\s*\?$/.exec(q))) return String(+m[1] + +m[2]);
  if ((m = /^(\d+)\s*\+\s*\?\s*=\s*(\d+)$/.exec(q))) return String(+m[2] - +m[1]);
  if ((m = /^What number comes after (\d+)\?$/.exec(q))) return String(+m[1] + 1);
  if ((m = /^What number comes before (\d+)\?$/.exec(q))) return String(+m[1] - 1);
  if ((m = /^What comes next\? (\d+), (\d+), (\d+), \.\.\.$/.exec(q))) return String(+m[3] + 1);
  if ((m = /^Which is more, (\d+) or (\d+)\?$/.exec(q))) return String(Math.max(+m[1], +m[2]));
  if ((m = /^What is one more than (\d+)\?$/.exec(q))) return String(+m[1] + 1);
  if ((m = /^What is one less than (\d+)\?$/.exec(q))) return String(+m[1] - 1);
  if ((m = /^Start at (\d+) and count on (\d+)\.?( Where do you land\?)?$/.exec(q))) return String(+m[1] + +m[2]);
  if ((m = /^How many sides does a (\w+) have\?$/.exec(q))) return SIDES[m[1]] != null ? String(SIDES[m[1]]) : null;
  if ((m = /^How many corners does a (\w+) have\?$/.exec(q))) return SIDES[m[1]] != null ? String(SIDES[m[1]]) : null;
  if (/^Which shape is round with no corners\?$/.test(q)) return "circle";
  if (/^Which shape has four sides all the same\?$/.test(q)) return "square";
  if (/^Which shape has three corners\?$/.test(q)) return "triangle";
  if (/^Which shape has four sides with two longer\?$/.test(q)) return "rectangle";
  if (/^Tri means three\. So which shape is it\?$/.test(q)) return "triangle";
  if (/^Which shape can roll along the floor\?$/.test(q)) return "circle";
  if ((m = /^A (.+) is which shape\?$/.exec(q))) return REAL_WORLD[m[1]] || null;
  if ((m = /^A (.+) is often which shape\?$/.exec(q))) return REAL_WORLD[m[1]] || null;
  if ((m = /^Which shape is a (.+) most like\?$/.exec(q))) return REAL_WORLD[m[1]] || null;
  if ((m = /^(\d+) needs how many to make (\d+)\?$/.exec(q))) return String(+m[2] - +m[1]);
  if ((m = /^How many are in the frame\?$|^How many now\?$|^How many when both rows are full\?$/.exec(q))) return "PICTURE";
  if (/which shape\?$/i.test(q)) return null;
  return null;
}

for (const L of lessons) {
  console.log(`${L.id} (${L.grade} ${L.subject} / ${L.skill})`);
  const groups = [["guided", L.guided], ["check", L.check], ["practice", L.solo.fallback]];
  for (const [name, arr] of groups) {
    (arr || []).forEach((q, i) => {
      checked++;
      const want = expected(q.question);
      if (want === "PICTURE") {
        // Answered from the ten frame drawn beside it, so verify against show.
        const total = (q.show ? (q.show.a || 0) + (q.show.b || 0) : null);
        if (total == null) { unknown++; return; }
        if (String(q.choices[q.correctIndex]) !== String(total)) fail(`${name} ${i + 1}`, q, `the picture shows ${total}`);
        return;
      }
      if (want == null) { unknown++; console.log(`  ?     ${name} ${i + 1}: no independent rule for "${q.question}"`); return; }
      const got = String(q.choices[q.correctIndex]);
      if (got !== String(want)) fail(`${name} ${i + 1}`, q, `the answer is ${want}`);
      // The right answer must also not appear twice among the choices.
      if (q.choices.filter((c) => String(c) === got).length > 1) fail(`${name} ${i + 1}`, q, "the answer appears twice in the choices");
    });
  }
}

console.log(`\nchecked ${checked} questions - wrong: ${bad}, no rule: ${unknown}`);
if (bad) { console.log("FAILED - do not ship this batch"); process.exit(1); }
console.log(unknown ? "PASSED (with questions no rule covers - read those by hand)" : "ALL ANSWERS VERIFIED");
