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
//   node scripts/planner.mjs review LP3           done, but wants Mike's eyes first
//   node scripts/planner.mjs deployed LP3         mark it live
//   node scripts/planner.mjs note LP3 "text"      add one session note
//   node scripts/planner.mjs add LP4 LP "Title" "Body"   new card in phase LP
//   node scripts/planner.mjs reword LP3 --name "..." --desc "..."
//
// Override the target with PLANNER_URL for a preview deploy or a local dev server.
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

const MARK = { done: "[x]", review: "[?]", later: "[~]", open: "[ ]" };

async function list(args) {
  const all = args.includes("--all");
  const phase = args.find((a) => !a.startsWith("--")) || null;
  const { phases, cards } = await get("?scope=roadmap");
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
    if (args[1]) await post({ op: "note", id, text: args[1] });
    const { card } = await post({ op: "card", id, fields: { done: true } });
    console.log("done: " + card.id + " " + card.name);
    break;
  }
  case "open": case "undone":
    await post({ op: "card", id: id || die("which card?"), fields: { done: false } });
    console.log("reopened: " + id);
    break;
  case "review":
    await post({ op: "card", id: id || die("which card?"), fields: { needsReview: true } });
    console.log("flagged for review: " + id);
    break;
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
  default:
    die("unknown command '" + cmd + "'. Try: list, show, done, open, review, deployed, note, add, reword");
}
