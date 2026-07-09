// buddy.js — Buddy 2.0 brain (Session 6E). The buddy is event-driven: it speaks
// RARELY and SPECIFICALLY, only at natural break points (a win, a level cleared,
// a game over, a return visit) — never during play. What it says is decided by
// crossing a contract message (win/levelComplete/score/coins) with the kid's own
// history (how many tries this took, personal bests, favorite game). Personality
// comes from the game's manifest. Hard rules live here: a few moments per session
// max, a quiet gap between moments, a parent off switch, and no emojis ever.
//
// This module is the single source of truth for "should the buddy speak, and what
// should it say." The renderer (HelperReactions.jsx) only draws + voices the line.
import { getActiveKid } from "./accounts";

// ---- Parent toggle (device-level, default ON) ------------------------------
const ENABLED_KEY = "bk_buddy_enabled";
export function isBuddyEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) !== "0"; } catch (e) { return true; }
}
export function setBuddyEnabled(on) {
  try { localStorage.setItem(ENABLED_KEY, on ? "1" : "0"); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent("bk-buddy-settings", { detail: { enabled: !!on } })); } catch (e) {}
  return !!on;
}

// ---- Rate limiting (per page-load session) ---------------------------------
// A "session" is one load of the app. These counters reset on a full refresh,
// which is exactly what we want: a handful of moments per sitting, no chatter.
const MAX_PER_SESSION = 4;   // hard ceiling on spoken moments per sitting
const MIN_GAP_MS = 45 * 1000; // quiet stretch required between two moments
let momentsThisSession = 0;
let lastMomentAt = 0;
const wonThisSession = new Set();   // games already congratulated this sitting
let welcomedThisSession = false;    // the return-visit hello fires at most once

function canSpeak() {
  if (!isBuddyEnabled()) return false;
  if (momentsThisSession >= MAX_PER_SESSION) return false;
  if (Date.now() - lastMomentAt < MIN_GAP_MS) return false;
  return true;
}
function noteSpoke() { momentsThisSession += 1; lastMomentAt = Date.now(); }

// ---- Per-kid history (localStorage; complements the server stats) ----------
// attempts = losses since the last win on a game (so we can spot a hard-won
// victory). best = highest score we have seen locally per game.
function scope() { try { const k = getActiveKid(); return (k && k.id) || "guest"; } catch (e) { return "guest"; } }
function readMap(key) { try { return JSON.parse(localStorage.getItem(key + ":" + scope()) || "{}") || {}; } catch (e) { return {}; } }
function writeMap(key, m) { try { localStorage.setItem(key + ":" + scope(), JSON.stringify(m)); } catch (e) {} }
const ATTEMPTS_KEY = "bk_buddy_attempts";
const BEST_KEY = "bk_buddy_best";

// A loss: one more try on this game. Returns the new streak of losses.
export function noteLoss(game) {
  if (!game) return 0;
  const m = readMap(ATTEMPTS_KEY); m[game] = (m[game] || 0) + 1; writeMap(ATTEMPTS_KEY, m); return m[game];
}
// A win: how many losses preceded it, then reset the counter.
export function takeAttempts(game) {
  if (!game) return 0;
  const m = readMap(ATTEMPTS_KEY); const n = m[game] || 0; if (n) { m[game] = 0; writeMap(ATTEMPTS_KEY, m); } return n;
}
// Track a personal best locally. Returns true only when it is genuinely a new high.
export function recordBest(game, score) {
  if (!game || score == null || !isFinite(score)) return false;
  const m = readMap(BEST_KEY); const prev = m[game];
  if (prev == null || score > prev) { m[game] = score; writeMap(BEST_KEY, m); return prev != null; }
  return false;
}

// ---- Personalities (per game, from manifest features.buddy.personality) ----
// Placeholders: %NAME% kid name, %GAME% game name, %SCORE% score. No emojis.
const P = {
  cheerleader: {
    bigWin:  ["New best ever — %SCORE%! You are unstoppable!", "%SCORE%! That is your best score yet — amazing!"],
    grind:   ["You finally did it! All those tries paid off!", "Yes! That was a tough one and you beat it!"],
    win:     ["Woohoo! Great job, %NAME%!", "You did it! Superstar!"],
    encourage:["So close! I know you can beat it — one more go!", "Almost had it! You are getting better every try."],
    welcome: ["Welcome back, %NAME%! Ready for some fun?"],
    welcomeFav:["Welcome back, %NAME%! Want to play %GAME% again?"],
  },
  coach: {
    bigWin:  ["New personal best: %SCORE%. That is real progress, %NAME%.", "%SCORE% — a new record. Your practice is showing."],
    grind:   ["That took grit and you got it. Well earned.", "You stuck with it and cracked it. Nice work."],
    win:     ["Solid win, %NAME%. On to the next.", "Clean run. Good focus."],
    encourage:["Close one. Watch your timing and try again.", "Almost. You are one step from it — go again."],
    welcome: ["Good to see you, %NAME%. Let us get to work."],
    welcomeFav:["Good to see you, %NAME%. Another round of %GAME%?"],
  },
  chill: {
    bigWin:  ["Whoa, new best — %SCORE%! Nice one, %NAME%.", "%SCORE%! That is your top score. Sweet."],
    grind:   ["You got there in the end. Feels good, right?", "Took a few tries, but you made it. Nice."],
    win:     ["Nice, %NAME%! That was fun.", "There it is! Good one."],
    encourage:["Ah, so close. No rush — try again whenever.", "Almost! You will get it next time."],
    welcome: ["Hey %NAME%, good to see you."],
    welcomeFav:["Hey %NAME%, feel like some %GAME%?"],
  },
};
function persona(name) { return P[name] || P.cheerleader; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fill(t, ctx) {
  return String(t)
    .replace(/%NAME%/g, ctx.kidName || "friend")
    .replace(/%GAME%/g, ctx.gameName || "that game")
    .replace(/%SCORE%/g, ctx.score != null ? String(ctx.score) : "");
}

// ---- The decision: should the buddy speak, and what does it say? ------------
// Returns { text, tone } when a moment is worth it (and rate limits allow), else
// null. tone is "win" (bright) or "encourage" (warm) for the bubble accent.
// Calling this and getting a non-null result CONSUMES one of the session's
// moments — so only call it when you actually intend to show the result.
export function decideMoment(ev) {
  const { kind, meta = {}, game, gameName, personality, kidName, favoriteGameName } = ev || {};
  const lines = persona(personality);
  const ctx = { kidName, gameName, score: meta.score };

  // Return-visit hello (fired by Home once per session).
  if (kind === "welcome") {
    if (welcomedThisSession) return null;
    if (!canSpeak()) return null;
    const t = favoriteGameName
      ? fill(pick(lines.welcomeFav), { kidName, gameName: favoriteGameName })
      : fill(pick(lines.welcome), ctx);
    welcomedThisSession = true; noteSpoke();
    return { text: t, tone: "win" };
  }

  // Wins / level clears — only speak when the moment is special.
  if (kind === "win" || kind === "levelup" || kind === "levelComplete" || (kind === "score" && meta.newBest)) {
    const isBest = !!meta.newBest || (meta.score != null && recordBest(game, meta.score));
    const attempts = takeAttempts(game); // reads + clears the loss streak
    let text = null, tone = "win";
    if (isBest && meta.score != null) text = fill(pick(lines.bigWin), ctx);
    else if (attempts >= 3) text = fill(pick(lines.grind), ctx);
    else if (game && !wonThisSession.has(game)) text = fill(pick(lines.win), ctx);
    if (!text) return null;                 // an ordinary repeat win — stay quiet
    if (!canSpeak()) return null;
    if (game) wonThisSession.add(game);
    noteSpoke();
    return { text, tone };
  }

  // Losses — stay quiet, except a gentle nudge after a real losing streak.
  if (kind === "lose") {
    const streak = noteLoss(game);
    if (streak > 0 && streak % 3 === 0) {   // every 3rd loss in a row, at most
      if (!canSpeak()) return null;
      noteSpoke();
      return { text: fill(pick(lines.encourage), ctx), tone: "encourage" };
    }
    return null;
  }

  // Explicit cheer with a game-authored line — honor it (still rate limited).
  if (kind === "cheer" && meta.text) {
    if (!canSpeak()) return null;
    noteSpoke();
    return { text: String(meta.text), tone: "win" };
  }

  // score without a best, coins, bare cheer: context only, never a pop.
  return null;
}

// Test/support hook: reset session counters (used by the app on profile switch).
export function resetBuddySession() {
  momentsThisSession = 0; lastMomentAt = 0; welcomedThisSession = false; wonThisSession.clear();
}
