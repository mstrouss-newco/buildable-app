#!/usr/bin/env node
// scripts/planner.mjs — read and write the roadmap planner from the command line.
//
// The planner page (/planner) is only a front end; the cards live in Supabase and
// are reached through /api/planner, which carries the service key server-side. So
// this tool needs NO key, NO browser and nobody signed in. It works from any
// machine with internet, including an unattended run.
//
//   node scripts/planner.mjs list                 open cards, grouped by phase
//   node scripts/planner.mjs list LP              just phase LP
//   node scripts/planner.mjs list --all           every card, whatever its state
//   node scripts/planner.mjs show LP3             one card in full, with its notes
//   node scripts/planner.mjs done LP3 "what shipped"     tick it off (note optional)
//   node scripts/planner.mjs open LP3             untick it
//   node scripts/planner.mjs review LP3 "Does the palette look right?  context"
//                                                 wants Mike's eyes. FIRST sentence
//                                                 must be the question, ending in ?.
//   node scripts/planner.mjs deployed LP3         mark it live
//   node scripts/planner.mjs note LP3 "text"      add one session note
//   node scripts/planner.mjs add LP4 LP "Title" "Body"   new card in phase LP
//   node scripts/planner.mjs reword LP3 --name "..." --desc "..."
//   node scripts/planner.mjs stranded             branches on origin whose work is not in main
//
// `done` runs a git gate first: working tree clean, HEAD in origin/main. If not,
// the card is flagged for review with a note naming what is stranded, and the
// command exits non-zero rather than silently ticking a false green. See RN1.
//
// Override the target with PLANNER_URL for a preview deploy or a local dev server.
import { gateCheck, strandedBranches } from './git-gate.mjs';
const API = process.env.PLANNER_URL || "https://buildablekids.com/api/planner";

const die = (m) => { console.error("planner: " + m); process.exit(1); };

async function get(qs = "") {
  const r = await fetch(API + qs, { headers: { "Cache-Control": "no-store" } });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) die((j.error || j.detail || "read failed") + " (http " + r.status + ")");
  return j;
}
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) die((j.error || j.detail || "write failed") + " (http " + r.status + ")");
  return j;
}

// Pull a named flag out of the args: --name "value"
function flag(args, key) {
  const i = args.indexOf("--" + key);
  return i === -1 ? null : args[i + 1];
}

// True if the first sentence of `text` is a question. Walks the string until
// it hits '?', '.', or newline: '?' first is a pass, anything else is not.
// Allows "Does X look right?  Then any context." on one line — the point is
// the question comes FIRST, not that it stands alone.
function opensWithQuestion(text) {
  const s = String(text || "").trimStart();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "?") return true;
    if (ch === "." || ch === "\n" || ch === "!") return false;
  }
  return false;
}

const MARK = { done: "[x]", review: "[?]", later: "[~]", open: "[ ]" };

async function list(args) {
  const all = args.includes("--all");
  const phase = args.find((a) => !a.startsWith("--")) || null;
  const { phases, cards, autorun } = await get("?scope=roadmap");
  if (autorun && autorun.phase && !["done", "stopped"].includes(autorun.status)) {
    console.log("queued: phase " + autorun.phase + " (" + autorun.status + (autorun.note ? " — " + autorun.note : "") + ")");
  }
  const titles = Object.fromEntries(phases.map((p) => [String(p.num), p.title]));
  let show = cards;
  if (phase) show = show.filter((c) => String(c.phaseNum) === String(phase));
  if (!all) show = show.filter((c) => c.state === "open" || c.state === "review");
  if (!show.length) return console.log(all ? "no cards match" : "nothing open" + (phase ? " in phase " + phase : ""));
  // Cards are one flat array across all phases and newly added ones land at the
  // end, so group by phase order rather than by however the array happens to run.
  const order = new Map(phases.map((p, i) => [String(p.num), i]));
  show = show
    .map((c, i) => ({ c, i }))
    .sort((a, x) => (order.get(String(a.c.phaseNum)) ?? 99) - (order.get(String(x.c.phaseNum)) ?? 99) || a.i - x.i)
    .map((o) => o.c);
  let last = null;
  for (const c of show) {
    if (c.phaseNum !== last) { last = c.phaseNum; console.log("\nPhase " + last + (titles[String(last)] ? " — " + titles[String(last)] : "")); }
    const notes = c.notes ? "  " + c.notes + (c.notes === 1 ? " note" : " notes") : "";
    console.log("  " + MARK[c.state] + " " + String(c.id).padEnd(6) + c.name + (c.deployed ? "  (live)" : "") + notes);
  }
  const scope = phase ? cards.filter((c) => String(c.phaseNum) === String(phase)) : cards;
  const open = scope.filter((c) => c.state === "open").length;
  console.log("\n" + open + " open of " + scope.length + (phase ? " in phase " + phase : " cards"));
}

async function show(id) {
  const { meta } = await get();
  const cards = (meta.roadmap && meta.roadmap.sessions) || [];
  const c = cards.find((s) => s.id === id) || die("no card " + id);
  const state = c.done ? "done" : c.needsReview ? "needs review" : c.later ? "later" : "open";
  console.log(c.id + "  " + c.name + "\nphase " + c.phaseNum + "  |  " + state + (c.deployed ? "  |  live" : "") + "\n\n" + (c.desc || "(no description)"));
  if ((c.notes || []).length) console.log("\nnotes:\n" + c.notes.map((n) => "  - " + n).join("\n"));
}

const [cmd, ...args] = process.argv.slice(2);
const id = args[0];

switch (cmd) {
  case "list": case undefined: await list(args); break;
  case "show": await show(id || die("which card?")); break;

  case "done": {
    if (!id) die("which card?");
    const gate = gateCheck();
    if (!gate.ok) {
      const stamp = new Date().toISOString().slice(0, 10);
      await post({ op: "note", id, text: `[${stamp} gate] not marked done — ${gate.note}` });
      await post({ op: "card", id, fields: { needsReview: true } });
      console.log("HOLD: " + id + " flagged for review, not done.");
      console.log("Why: " + gate.note);
      console.log("Next session: " + gate.hint);
      process.exit(2);
    }
    if (gate.skipped) console.log("(gate skipped — not inside a git checkout)");
    if (args[1]) await post({ op: "note", id, text: args[1] });
    const { card } = await post({ op: "card", id, fields: { done: true } });
    console.log("done: " + card.id + " " + card.name);
    break;
  }
  case "open": case "undone":
    await post({ op: "card", id: id || die("which card?"), fields: { done: false } });
    console.log("reopened: " + id);
    break;
  case "review": {
    // A review is the planner asking Mike for a decision. Without a note it
    // asks him for a decision without saying what the decision IS — which is
    // how SD4, RN3 and FM1 all landed on his desk with no question attached
    // on 2026-08-15/16. So: refuse without a note, and require the note to
    // OPEN with the question ('Does the farm palette look right?'), not a
    // description of the work.
    if (!id) die("which card?");
    const note = args[1];
    if (!note) {
      die('review needs a note whose FIRST sentence is the question for Mike.\n' +
          '  planner review ' + id + ' "Does the farm palette look right?  All four crops shipped."');
    }
    if (!opensWithQuestion(note)) {
      die('review note must OPEN with the question (ending in "?") before any other sentence.\n' +
          '  you wrote: ' + note.slice(0, 100).replace(/\s+/g, ' ') + (note.length > 100 ? '…' : '') + '\n' +
          '  try:       "Does the farm palette look right?  All four crops shipped, but the corn looks yellow-ish."');
    }
    await post({ op: "note", id, text: note });
    await post({ op: "card", id, fields: { needsReview: true } });
    console.log("flagged for review: " + id + " (with question)");
    break;
  }
  case "deployed": case "live":
    await post({ op: "card", id: id || die("which card?"), fields: { deployed: true } });
    console.log("marked live: " + id);
    break;
  case "note": {
    if (!id || !args[1]) die('usage: note <card> "text"');
    const r = await post({ op: "note", id, text: args[1] });
    console.log("note added to " + id + " (" + r.notes + " total)");
    break;
  }
  case "add": {
    const [cardId, phaseNum, name, desc] = args;
    if (!cardId || !phaseNum || !name) die('usage: add <id> <phase> "Title" "Body"');
    const r = await post({ op: "addCard", card: { id: cardId, phaseNum, name, desc: desc || "" } });
    console.log("added " + r.id + " to phase " + r.phaseNum + " (" + r.cards + " cards now)");
    break;
  }
  case "queue": {
    // Same request the planner page's "Run this phase" button makes.
    if (!id) die('usage: queue <phase> [max]');
    const r = await post({ op: "queue", phase: id, max: args[1] });
    if (r.queuedBehind) console.log("phase " + id + " is lined up behind " + r.autorun.phase + " (" + r.open + " open). It will start on its own.");
    else console.log("phase " + id + " queued (up to " + r.autorun.max + " cards, " + r.open + " open). A watching runner will pick it up.");
    break;
  }
  case "unqueue":
    await post({ op: "unqueue" });
    console.log("queue cleared");
    break;

  case "reword": {
    if (!id) die("which card?");
    const fields = {};
    const n = flag(args, "name"), d = flag(args, "desc");
    if (n) fields.name = n;
    if (d) fields.desc = d;
    if (!Object.keys(fields).length) die('nothing to change: pass --name "..." or --desc "..."');
    const { card } = await post({ op: "card", id, fields });
    console.log("reworded: " + card.id + " " + card.name);
    break;
  }

  case "stranded": {
    const r = strandedBranches();
    if (r.skipped) { console.log("stranded: run this inside a git checkout of the repo."); break; }
    if (!r.branches.length) {
      console.log("No stranded branches on origin — every branch's real work is in main.");
      break;
    }
    console.log(r.branches.length + " branch" + (r.branches.length === 1 ? '' : 'es') +
      " on origin carrying commits main does not have:\n");
    for (const b of r.branches) {
      console.log("  " + b.branch);
      console.log("    " + b.count + " commit" + (b.count === 1 ? '' : 's') + " ahead of main");
      console.log("    files: " + b.files.slice(0, 8).join(', ') + (b.files.length > 8 ? '…' : ''));
      console.log("");
    }
    console.log("Doc-only churn (SESSION-LOG.md, README.md, AUTOPILOT-REPORT.md) and any");
    console.log("branch whose head commit says 'NOT for main' are ignored.");
    break;
  }

  default:
    die("unknown command '" + cmd + "'. Try: list, show, done, open, review, deployed, note, add, reword, stranded");
}
