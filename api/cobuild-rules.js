// /api/cobuild-rules.js — THE HOUSE RULES (Session CB4).
//
// Three rules a grown-up can turn on, per kid, ALL OFF BY DEFAULT. None of them
// nags, none of them punishes, and none of them is visible to a child until it
// actually applies.
//
//   Vegetables first  a question before the next level unlocks, on the games the
//                     grown-up chose. It is not a new feature: it applies the CB2
//                     `mathGate` recipe to those games' manifests, so the change
//                     is re-validated and re-played by the robot like any other.
//   Chores unlock play  a short list the grown-up writes. The game launcher asks
//                     here first and shows a friendly "these first" screen — a
//                     list to tick, never a nag, and it clears itself each day.
//   Play clock        minutes a day. There is NO countdown on screen: the child
//                     plays, and when the time is up the game ends the way a win
//                     ends, with a goodnight.
//
//   GET/POST { op:"get",   familyId, kidId }            -> { ok, rules }
//   POST { op:"set",   familyId, kidId, rules:{...} }    -> { ok, rules, applied }
//   POST { op:"gate",  familyId, kidId }                 -> { ok, allowed, why, chores, minutesLeft }
//   POST { op:"tick",  familyId, kidId, minutes }        -> { ok, minutesLeft, over }
//   POST { op:"chore", familyId, kidId, choreId, done }  -> { ok, chores, allowed }
//
// Only /studio, /studio/grownups and the app's own game launcher call this. It
// carries the service key server-side, like every other Cobuild endpoint.
import { sheetFor, recipeLib } from "./_cobuild.js";
import { ENGINES, checkManifest, robotCheck, robotRow } from "./kid-game.js";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const enc = encodeURIComponent;
const str = (v, n) => (v == null ? "" : String(v)).trim().slice(0, n || 120);
const today = () => new Date().toISOString().slice(0, 10);

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
async function sb(p, init) { return fetch(`${URL_}/rest/v1/${p}`, { ...(init || {}), headers: { ...H, ...((init && init.headers) || {}) } }); }
async function rows(p) { const r = await sb(p); if (!r.ok) return null; const j = await r.json().catch(() => null); return Array.isArray(j) ? j : null; }

const OFF = { veg_first: false, veg_games: [], chores: [], chores_done: {}, play_minutes: 0, play_used: {} };
async function get(familyId, kidId) {
  if (!URL_ || !KEY) return { ...OFF };
  const r = await rows(`cobuild_house_rules?family_id=eq.${enc(familyId)}&kid_id=eq.${enc(kidId)}&select=*&limit=1`);
  return (r && r[0]) || { ...OFF };
}
async function put(familyId, kidId, patch) {
  const row = { family_id: familyId, kid_id: kidId, ...patch, updated_at: new Date().toISOString() };
  const r = await sb("cobuild_house_rules", { method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify([row]) });
  const out = await r.json().catch(() => null);
  return (Array.isArray(out) && out[0]) || null;
}

// What a child sees, with nothing about the rule itself unless it applies.
export function asRules(row) {
  const done = (row.chores_done && row.chores_done.date === today()) ? (row.chores_done.done || []) : [];
  const used = (row.play_used && row.play_used.date === today()) ? (row.play_used.minutes || 0) : 0;
  const chores = (row.chores || []).map((c) => ({ id: c.id, text: c.text, done: done.indexOf(c.id) !== -1 }));
  return { vegFirst: !!row.veg_first, vegGames: row.veg_games || [], chores,
    playMinutes: row.play_minutes || 0, minutesUsed: used,
    minutesLeft: row.play_minutes ? Math.max(0, row.play_minutes - used) : null };
}

// The gate decision, pure and on its own, so the launcher, the studio and the QA
// harness all read the SAME rule rather than three copies of it.
export function gateFrom(v) {
  const undone = (v.chores || []).filter((c) => !c.done);
  if (undone.length) return { allowed: false, why: "chores", said: "These first, then play.", chores: v.chores, minutesLeft: v.minutesLeft };
  if (v.playMinutes && v.minutesLeft <= 0) return { allowed: false, why: "clock", said: "That is all the play time for today. See you tomorrow.", chores: v.chores, minutesLeft: 0 };
  return { allowed: true, chores: v.chores, minutesLeft: v.minutesLeft };
}

// VEGETABLES FIRST is the CB2 mathGate recipe, applied to the games the grown-up
// chose and taken off the ones they did not. It goes through the recipe book and
// the robot like any other change, so turning a house rule on can never leave a
// child with a game that no longer works.
async function applyVeg(familyId, wanted, on) {
  if (!URL_ || !KEY) return { changed: [], skipped: [] };
  const R = await recipeLib();
  if (!R) return { changed: [], skipped: [], why: "the recipe book could not be read" };
  const changed = [], skipped = [];
  for (const id of (wanted || []).slice(0, 30)) {
    const r = await rows(`kid_games?id=eq.${enc(id)}&family_id=eq.${enc(familyId)}&deleted_at=is.null&select=id,engine,manifest&limit=1`);
    const g = r && r[0];
    if (!g || !ENGINES[g.engine]) { skipped.push({ id, why: "not this family's game" }); continue; }
    const sheet = await sheetFor(g.engine);
    const out = R.apply("mathGate", g.manifest, { on: !!on }, sheet || null);
    if (!out.ok) { skipped.push({ id, why: out.error }); continue; }
    const valid = await checkManifest(out.manifest, g.engine);
    if (!valid.ok) { skipped.push({ id, why: valid.errors[0] }); continue; }
    const verdict = await robotCheck(out.manifest, g.engine, { suggest: false });
    if (!verdict.playable) { skipped.push({ id, why: "the robot could not finish it with the questions in" }); continue; }
    const up = await sb(`kid_games?id=eq.${enc(id)}`, { method: "PATCH",
      body: JSON.stringify({ manifest: out.manifest, robot: robotRow(verdict), updated_at: new Date().toISOString() }) });
    if (up.ok) changed.push(id); else skipped.push({ id, why: "could not save" });
  }
  return { changed, skipped };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !KEY) return res.status(503).json({ ok: false, error: "not configured" });
  try {
    const q = new URLSearchParams(String(req.url || "").split("?")[1] || "");
    const body = req.method === "POST" ? await readBody(req) : {};
    const pick = (k) => (body && body[k] != null ? body[k] : q.get(k));
    const op = str(pick("op"), 12) || "get";
    const familyId = str(pick("familyId"), 80), kidId = str(pick("kidId"), 80) || "default";
    if (!familyId) return res.status(400).json({ ok: false, error: "familyId required" });

    // ---- who is in this house, and what have they made ---------------------
    // The grown-up page needs a shelf per kid. It comes from the family's own
    // games rather than from kid_game.js's list, because a shelf needs the kid
    // id to hang house rules on and CB1 deliberately keeps that id server-side.
    // This call is family-scoped and service-key only, so the id never travels
    // further than the grown-up who owns it.
    if (op === "kids") {
      const gs = await rows("kid_games?family_id=eq." + enc(familyId) + "&deleted_at=is.null&select=id,kid_id,kid_name,name,cover,engine,plays,shared,public,robot,created_at&order=created_at.desc&limit=200");
      const by = new Map();
      for (const g of (gs || [])) {
        const key = g.kid_id || "default";
        if (!by.has(key)) by.set(key, { kidId: key, kidName: g.kid_name || "", games: [] });
        const shelf = by.get(key);
        if (!shelf.kidName && g.kid_name) shelf.kidName = g.kid_name;
        shelf.games.push({ id: g.id, name: g.name, cover: g.cover, engine: g.engine,
          plays: g.plays || 0, shared: !!g.shared, public: !!g.public,
          verdict: (g.robot && g.robot.verdict) || null, madeAt: g.created_at });
      }
      const out = [];
      for (const shelf of by.values()) out.push({ ...shelf, rules: asRules(await get(familyId, shelf.kidId)) });
      return res.status(200).json({ ok: true, kids: out });
    }

    if (op === "get") return res.status(200).json({ ok: true, rules: asRules(await get(familyId, kidId)) });
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ ok: false, error: "POST only for " + op }); }

    // ---- a grown-up sets them ---------------------------------------------
    if (op === "set") {
      const r = body.rules || {};
      const cur = await get(familyId, kidId);
      const patch = {};
      let applied = null;
      if ("vegFirst" in r || "vegGames" in r) {
        const on = "vegFirst" in r ? !!r.vegFirst : !!cur.veg_first;
        const games = Array.isArray(r.vegGames) ? r.vegGames.map((x) => str(x, 64)).filter(Boolean).slice(0, 30) : (cur.veg_games || []);
        // Games dropped from the list get the questions taken back off, so turning
        // a rule off really turns it off rather than leaving it in the manifest.
        const dropped = (cur.veg_games || []).filter((x) => games.indexOf(x) === -1);
        applied = await applyVeg(familyId, on ? games : games.concat(dropped), on ? true : false);
        if (on && dropped.length) await applyVeg(familyId, dropped, false);
        patch.veg_first = on; patch.veg_games = games;
      }
      if ("chores" in r) {
        patch.chores = (Array.isArray(r.chores) ? r.chores : []).slice(0, 8).map((c, i) => ({
          id: str((c && c.id) || "c" + (i + 1), 12), text: str((c && c.text) || "", 60) })).filter((c) => c.text);
      }
      if ("playMinutes" in r) patch.play_minutes = Math.max(0, Math.min(600, parseInt(r.playMinutes, 10) || 0));
      const saved = await put(familyId, kidId, { ...cur, ...patch });
      return res.status(200).json({ ok: true, rules: asRules(saved || { ...OFF, ...patch }), applied });
    }

    // ---- the gate the game launcher asks ----------------------------------
    if (op === "gate") {
      const v = asRules(await get(familyId, kidId));
      return res.status(200).json({ ok: true, ...gateFrom(v) });
    }

    // ---- the play clock, counted while a game is open ---------------------
    if (op === "tick") {
      const row = await get(familyId, kidId);
      if (!row.play_minutes) return res.status(200).json({ ok: true, minutesLeft: null, over: false });
      const used0 = (row.play_used && row.play_used.date === today()) ? (row.play_used.minutes || 0) : 0;
      const used = used0 + Math.max(0, Math.min(30, parseInt(pick("minutes"), 10) || 1));
      await put(familyId, kidId, { ...row, play_used: { date: today(), minutes: used } });
      const left = Math.max(0, row.play_minutes - used);
      return res.status(200).json({ ok: true, minutesLeft: left, over: left <= 0,
        said: left <= 0 ? "That is all the play time for today. Goodnight." : null });
    }

    // ---- a child ticks a chore -------------------------------------------
    if (op === "chore") {
      const row = await get(familyId, kidId);
      const id = str(pick("choreId"), 12);
      const on = pick("done") !== false && str(pick("done"), 6) !== "false";
      const cur = (row.chores_done && row.chores_done.date === today()) ? (row.chores_done.done || []) : [];
      const next = on ? (cur.indexOf(id) === -1 ? cur.concat(id) : cur) : cur.filter((x) => x !== id);
      const saved = await put(familyId, kidId, { ...row, chores_done: { date: today(), done: next } });
      const v = asRules(saved || { ...row, chores_done: { date: today(), done: next } });
      return res.status(200).json({ ok: true, chores: v.chores, allowed: v.chores.every((c) => c.done) });
    }

    return res.status(400).json({ ok: false, error: "unknown op '" + op + "'" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
