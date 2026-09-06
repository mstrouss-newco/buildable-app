// buildable-practice.js (BP) — the shared practice deck engine.
//
// Session PT1. One engine, every subject. It knows NOTHING about sight words,
// and nothing about maths: it only knows about DECKS of ITEMS, a per-kid box for
// each item, and how a session is built. Sight words ship on it first (PT1);
// the four maths operations arrive in PT3 as more deck files, with zero changes
// in here. If you ever find yourself writing `if (deck.subject === "reading")`
// in this file, the design has gone wrong.
//
// ---------------------------------------------------------------------------
// THE BOX RULE (Leitner, tuned for kids)
//
//   Every item sits in a box, 1 to 5. New items start in box 1.
//     right AND fast  -> up a box   (max 5)
//     wrong OR slow   -> down a box (min 1)
//
//   "Fast" is answering in under 3000ms. It is measured SILENTLY. There is
//   never a timer, a countdown, a clock, or a "too slow!" anywhere in the
//   product — the kid simply notices the words they know coming round less
//   often. Anything that renders the milliseconds to a kid is a bug.
//
//   A higher box means a longer wait before the item is due again:
//     box 1 -> due now (same session)   box 2 -> 1 day    box 3 -> 2 days
//     box 4 -> 4 days                   box 5 -> 8 days
//
// ---------------------------------------------------------------------------
// THE SESSION RULE
//
//   About 20 items. Due reviews come first, and AT MOST 3 items the kid has
//   never seen are mixed in among them. A brand-new item is never quizzed cold:
//   it gets an INTRO moment first (word shown big, audio says it, the tricky
//   letters glow — the heart-word method), and only after that does it enter
//   the rotation.
//
//   Wrong answers are never punished. There are no lives, no score and no fail
//   state anywhere in a practice session. A missed item is simply requeued a
//   few cards later so it comes back sooner. That is the whole consequence.
//
// ---------------------------------------------------------------------------
// STORAGE
//
//   localStorage key `bk_practice_v1`, keyed by kid id:
//     { kids: { "<kidId>": { decks: { "<deckId>": { items: { "<itemId>":
//       { box, due, seen, right, wrong, last } } } } } } }
//
//   `due` and `last` are epoch milliseconds. A guest (no active kid) is stored
//   under "guest" so practice still works before anyone signs in.
//
// Public API (global BuildablePractice, also module.exports for the QA harness):
//   BP.FAST_MS                      -> 3000
//   BP.nextBox(box, correct, ms)    -> the new box number
//   BP.dueAt(box, now)              -> when an item in this box comes back
//   BP.newRecord(now)               -> a fresh box-1 record
//   BP.applyAnswer(rec, {correct, ms, now}) -> updated record (pure-ish)
//   BP.buildSession(deck, deckState, opts)  -> { plan, dueCount, newCount, ... }
//   BP.loadState() / BP.saveState(s)        -> the whole bk_practice_v1 blob
//   BP.kidState(state, kidId)               -> that kid's slice (created if new)
//   BP.deckState(state, kidId, deckId)      -> that deck's slice (created if new)
//   BP.recordAnswer(kidId, deckId, itemId, {correct, ms, now}) -> saves too
//   BP.summarize(answers)           -> { total, right, wrong, fast, accuracy }
//   BP.progress(deck, deckState)    -> { total, started, mastered, boxes }
//   BP.sessionEvent(deck, answers)  -> the ONE learning-ledger row for a session
(function (root) {
  "use strict";

  var STORE_KEY = "bk_practice_v1";
  var FAST_MS = 3000;               // under this = fast. Never shown to a kid.
  var MAX_BOX = 5;
  var MIN_BOX = 1;
  var DAY = 86400000;
  // Wait per box, in days, index 0 unused so BOX_DAYS[box] reads naturally.
  var BOX_DAYS = [0, 0, 1, 2, 4, 8];
  var SESSION_SIZE = 20;            // "about 20 items"
  var MAX_NEW = 3;                  // at most 3 never-seen items per session
  var REQUEUE_GAP = 3;              // a missed item comes back this many cards later

  // ---- the box rule -------------------------------------------------------
  // right AND fast -> up. wrong OR slow -> down. Nothing else moves a box.
  function nextBox(box, correct, ms) {
    var b = clampBox(box);
    var fast = typeof ms === "number" && ms >= 0 && ms < FAST_MS;
    if (correct && fast) return Math.min(MAX_BOX, b + 1);
    return Math.max(MIN_BOX, b - 1);
  }
  function clampBox(box) {
    var b = Math.round(Number(box));
    if (!isFinite(b)) return MIN_BOX;
    return Math.max(MIN_BOX, Math.min(MAX_BOX, b));
  }
  function dueAt(box, now) {
    var t = typeof now === "number" ? now : Date.now();
    return t + BOX_DAYS[clampBox(box)] * DAY;
  }
  function isFast(ms) { return typeof ms === "number" && ms >= 0 && ms < FAST_MS; }

  // ---- one item's record --------------------------------------------------
  function newRecord(now) {
    var t = typeof now === "number" ? now : Date.now();
    return { box: MIN_BOX, due: t, seen: 0, right: 0, wrong: 0, last: 0 };
  }
  function applyAnswer(rec, opts) {
    opts = opts || {};
    var now = typeof opts.now === "number" ? opts.now : Date.now();
    var r = rec ? {
      box: clampBox(rec.box), due: rec.due || now, seen: rec.seen || 0,
      right: rec.right || 0, wrong: rec.wrong || 0, last: rec.last || 0,
    } : newRecord(now);
    var correct = !!opts.correct;
    r.box = nextBox(r.box, correct, opts.ms);
    r.due = dueAt(r.box, now);
    r.seen += 1;
    if (correct) r.right += 1; else r.wrong += 1;
    r.last = now;
    return r;
  }

  // ---- building a session -------------------------------------------------
  // Due reviews first (most overdue first), then AT MOST `maxNew` never-seen
  // items spread through the run, then — only if the deck cannot fill 20 from
  // due items alone — the lowest-box seen items, so a session is never a
  // three-card anticlimax. Every never-seen item is flagged `intro`, and the
  // page MUST show the intro moment before quizzing it.
  function buildSession(deck, deckState, opts) {
    opts = opts || {};
    var now = typeof opts.now === "number" ? opts.now : Date.now();
    var size = opts.size || SESSION_SIZE;
    var maxNew = typeof opts.maxNew === "number" ? opts.maxNew : MAX_NEW;
    var items = (deck && deck.items) || [];
    var recs = (deckState && deckState.items) || {};
    var rng = opts.rng || Math.random;

    var due = [], fresh = [], resting = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i], rec = recs[it.id];
      if (!rec || !rec.seen) { fresh.push(it); continue; }
      if ((rec.due || 0) <= now) due.push({ item: it, rec: rec });
      else resting.push({ item: it, rec: rec });
    }
    // Most overdue first, then lowest box first — the shakiest words lead.
    due.sort(function (a, b) {
      var d = (a.rec.due || 0) - (b.rec.due || 0);
      return d !== 0 ? d : clampBox(a.rec.box) - clampBox(b.rec.box);
    });
    resting.sort(function (a, b) {
      var d = clampBox(a.rec.box) - clampBox(b.rec.box);
      return d !== 0 ? d : (a.rec.due || 0) - (b.rec.due || 0);
    });

    var news = fresh.slice(0, Math.max(0, maxNew));
    var reviewRoom = Math.max(0, size - news.length);
    var reviews = due.slice(0, reviewRoom).map(function (d) { return d.item; });
    if (reviews.length < reviewRoom) {
      var pad = resting.slice(0, reviewRoom - reviews.length);
      for (var p = 0; p < pad.length; p++) reviews.push(pad[p].item);
    }

    // Mix the new items in rather than front-loading them: spread them across
    // the run so the kid meets one, practises it among familiar words, meets
    // the next. With no reviews at all (a kid's very first session) the new
    // items simply lead, which is exactly right.
    var plan = reviews.map(function (it) { return { itemId: it.id, item: it, intro: false }; });
    var slots = spreadSlots(plan.length, news.length, rng);
    for (var n = news.length - 1; n >= 0; n--) {
      plan.splice(slots[n], 0, { itemId: news[n].id, item: news[n], intro: true });
    }
    return {
      plan: plan,
      dueCount: reviews.length,
      newCount: news.length,
      availableDue: due.length,
      availableNew: fresh.length,
    };
  }
  // Insertion points for `count` new items across a run of `len` reviews,
  // ascending, never all bunched at the front.
  function spreadSlots(len, count, rng) {
    var out = [];
    if (count <= 0) return out;
    if (len <= 0) { for (var z = 0; z < count; z++) out.push(z); return out; }
    var step = (len + 1) / (count + 1);
    for (var i = 0; i < count; i++) {
      var base = Math.floor(step * (i + 1));
      var jitter = rng() < 0.5 ? 0 : 1;
      out.push(Math.max(0, Math.min(len, base + jitter)));
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  // A missed item is requeued a few cards later — the ONLY consequence of a
  // wrong answer anywhere in practice. Never removes, never ends the session.
  function requeue(queue, index, entry, gap) {
    var g = typeof gap === "number" ? gap : REQUEUE_GAP;
    var at = Math.min(queue.length, index + 1 + g);
    queue.splice(at, 0, { itemId: entry.itemId, item: entry.item, intro: false, again: true });
    return queue;
  }

  // ---- distractors --------------------------------------------------------
  // Four big cards: the answer plus three others from the same deck. Subject
  // agnostic — for words the answer IS the word, for maths (PT3) it is the
  // result. Prefers same-length answers so the choice is a real read, not a
  // shape-spotting game.
  function choices(deck, item, opts) {
    opts = opts || {};
    var n = opts.count || 4;
    var rng = opts.rng || Math.random;
    var answer = answerOf(item);
    var pool = ((deck && deck.items) || []).filter(function (it) {
      return it.id !== item.id && answerOf(it) !== answer;
    });
    var near = pool.filter(function (it) { return Math.abs(answerOf(it).length - answer.length) <= 1; });
    var picked = [];
    takeFrom(near, picked, n - 1, rng);
    takeFrom(pool, picked, n - 1 - picked.length, rng);
    var all = [item].concat(picked);
    return shuffle(all, rng);
  }
  function takeFrom(pool, into, want, rng) {
    if (want <= 0) return;
    var copy = shuffle(pool.slice(), rng);
    var added = 0;
    for (var i = 0; i < copy.length && added < want; i++) {
      if (into.indexOf(copy[i]) !== -1) continue;
      into.push(copy[i]);
      added++;
    }
  }
  function shuffle(arr, rng) {
    var r = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // What a kid taps. Sight words: the word itself. Maths (PT3): the result.
  function answerOf(item) {
    if (!item) return "";
    return String(item.answer != null ? item.answer : (item.prompt != null ? item.prompt : ""));
  }
  // What the audio says. Falls back to the prompt, then the answer.
  function sayOf(item) {
    if (!item) return "";
    return String(item.say != null ? item.say : (item.prompt != null ? item.prompt : answerOf(item)));
  }

  // ---- per-kid storage ----------------------------------------------------
  function safeParse(s, fallback) { try { var v = JSON.parse(s); return v || fallback; } catch (e) { return fallback; } }
  function store() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  function loadState() {
    var ls = store();
    if (!ls) return { kids: {} };
    var s = safeParse(ls.getItem(STORE_KEY), null);
    if (!s || typeof s !== "object") s = { kids: {} };
    if (!s.kids || typeof s.kids !== "object") s.kids = {};
    return s;
  }
  function saveState(s) {
    var ls = store();
    if (!ls) return false;
    try { ls.setItem(STORE_KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }
  function kidKey(kidId) { return kidId ? String(kidId) : "guest"; }
  function kidState(state, kidId) {
    var k = kidKey(kidId);
    if (!state.kids[k]) state.kids[k] = { decks: {} };
    if (!state.kids[k].decks) state.kids[k].decks = {};
    return state.kids[k];
  }
  function deckState(state, kidId, deckId) {
    var kid = kidState(state, kidId);
    var d = String(deckId || "");
    if (!kid.decks[d]) kid.decks[d] = { items: {} };
    if (!kid.decks[d].items) kid.decks[d].items = {};
    return kid.decks[d];
  }
  // Grade one answer and persist it. Returns the updated record.
  function recordAnswer(kidId, deckId, itemId, opts) {
    var s = loadState();
    var ds = deckState(s, kidId, deckId);
    var rec = applyAnswer(ds.items[itemId], opts);
    ds.items[itemId] = rec;
    saveState(s);
    return rec;
  }

  // ---- placement (Session PT2) --------------------------------------------
  // A first visit runs a short warm-up spanning every deck — "let's see what you
  // already know" — and lands the kid on the right list instead of making a
  // reader start at "a". It is NOT a test: there is no pass mark, no score, and
  // getting one wrong costs nothing. Two probes per deck, easiest deck first.
  //
  // What it seeds is deliberately modest. Decks BELOW the landing deck get every
  // item PLACED at box 3, which says "you already know these, we will just keep
  // them ticking over" — never box 5, so placement can never mint a mastered
  // word or a bird the kid did not earn. Mastery is only ever earned by answering.
  var PLACEMENT_PER_DECK = 2;
  var PLACED_BOX = 3;

  function buildPlacement(decks, opts) {
    opts = opts || {};
    var per = opts.perDeck || PLACEMENT_PER_DECK;
    var rng = opts.rng || Math.random;
    var out = [];
    (decks || []).forEach(function (deck) {
      var items = (deck.items || []).slice();
      shuffle(items, rng);
      items.slice(0, per).forEach(function (it) {
        out.push({ deckId: deck.id, item: it, intro: false, itemId: it.id });
      });
    });
    return out;
  }

  // Where the warm-up lands the kid: the LAST deck they got at least half of
  // right. Nothing right anywhere lands them on the first deck, which is the
  // gentle answer, not a verdict.
  function placementResult(decks, answers) {
    var per = {};
    (answers || []).forEach(function (a) {
      if (!a || !a.deckId) return;
      var row = per[a.deckId] || (per[a.deckId] = { right: 0, total: 0 });
      row.total += 1;
      if (a.correct) row.right += 1;
    });
    var landing = (decks && decks[0] && decks[0].id) || null;
    (decks || []).forEach(function (deck) {
      var row = per[deck.id];
      if (row && row.total && row.right * 2 >= row.total) landing = deck.id;
    });
    // The landing deck is the one they are ready to WORK on, so it is the deck
    // after the last one they knew — unless they knew none, or knew them all.
    var ids = (decks || []).map(function (d) { return d.id; });
    var at = ids.indexOf(landing);
    var knewFirst = per[ids[0]] && per[ids[0]].right > 0;
    var next = (at >= 0 && knewFirst) ? Math.min(ids.length - 1, at + 1) : Math.max(0, at);
    return { landingDeckId: ids[next] || landing, knownThrough: at >= 0 && knewFirst ? ids[at] : null, perDeck: per };
  }

  // Seed the boxes and remember that the warm-up has been done. Returns how many
  // items were placed, so the page can say something true about it.
  function applyPlacement(kidId, decks, answers, opts) {
    opts = opts || {};
    var now = typeof opts.now === "number" ? opts.now : Date.now();
    var res = placementResult(decks, answers);
    var s = loadState();
    var kid = kidState(s, kidId);
    var placed = 0;
    var stop = false;
    (decks || []).forEach(function (deck) {
      if (stop) return;
      if (deck.id === res.landingDeckId) { stop = true; return; }
      var ds = deckState(s, kidId, deck.id);
      (deck.items || []).forEach(function (it, i) {
        var rec = ds.items[it.id];
        if (rec && rec.seen) return;                 // never overwrite real work
        ds.items[it.id] = {
          box: PLACED_BOX, due: now + (i % 4) * DAY, seen: 0,
          right: 0, wrong: 0, last: 0, placed: true,
        };
        placed += 1;
      });
    });
    kid.placement = { done: true, at: now, landingDeckId: res.landingDeckId, knownThrough: res.knownThrough };
    if (!kid.level) kid.level = res.landingDeckId;
    saveState(s);
    return { placed: placed, landingDeckId: res.landingDeckId, knownThrough: res.knownThrough };
  }
  function placement(state, kidId) {
    var kid = kidState(state || loadState(), kidId);
    return kid.placement || null;
  }
  // The Parents area can send a kid back through the warm-up. It clears only the
  // placement record and the seeded (never-answered) items — everything the kid
  // actually earned stays exactly where it is.
  function clearPlacement(kidId) {
    var s = loadState();
    var kid = kidState(s, kidId);
    delete kid.placement;
    Object.keys(kid.decks || {}).forEach(function (d) {
      var items = kid.decks[d].items || {};
      Object.keys(items).forEach(function (id) {
        if (items[id] && items[id].placed && !items[id].seen) delete items[id];
      });
    });
    saveState(s);
    return true;
  }

  // ---- the level a kid is working at (parent override) --------------------
  // Placement picks it; a grown-up can bump it up or down from the Parents area
  // and their choice wins from then on.
  function level(state, kidId) {
    var kid = kidState(state || loadState(), kidId);
    return kid.level || (kid.placement && kid.placement.landingDeckId) || null;
  }
  function setLevel(kidId, deckId) {
    var s = loadState();
    kidState(s, kidId).level = deckId || null;
    saveState(s);
    return deckId;
  }

  // ---- the collection (Session PT2) ---------------------------------------
  // One bird per MASTERED item — box 5, earned by answering, never by placement.
  // Counted straight off the saved state so the Parents area can report it
  // without loading a single deck file.
  function masteredByDeck(state, kidId) {
    var kid = kidState(state || loadState(), kidId);
    var out = {};
    Object.keys(kid.decks || {}).forEach(function (d) {
      var items = (kid.decks[d] || {}).items || {};
      var n = 0;
      Object.keys(items).forEach(function (id) {
        var r = items[id];
        if (r && r.seen && clampBox(r.box) >= MAX_BOX) n += 1;
      });
      out[d] = n;
    });
    return out;
  }
  function masteredTotal(state, kidId) {
    var by = masteredByDeck(state, kidId), n = 0;
    Object.keys(by).forEach(function (d) { n += by[d]; });
    return n;
  }
  // A whole deck finished — the big moment where every bird sings.
  function deckComplete(deck, ds) {
    var p = progress(deck, ds);
    return p.total > 0 && p.mastered === p.total;
  }

  // ---- sprint readiness (Session PT3) -------------------------------------
  // Sprint is a victory lap, not a wall: it opens for a deck only once practice
  // shows the kid is already fluent — about 80% of the facts they have actually
  // MET sitting at box 3 or better. Facts never introduced do not count against
  // them, so a kid is never blocked by work they have not been given yet.
  var SPRINT_READY_PCT = 0.8;
  var SPRINT_MIN_INTRODUCED = 12;
  function sprintReadiness(deck, ds, opts) {
    opts = opts || {};
    var need = typeof opts.pct === "number" ? opts.pct : SPRINT_READY_PCT;
    var min = typeof opts.min === "number" ? opts.min : SPRINT_MIN_INTRODUCED;
    var recs = (ds && ds.items) || {};
    var introduced = 0, solid = 0;
    ((deck && deck.items) || []).forEach(function (it) {
      var r = recs[it.id];
      if (!r || !r.seen) return;                    // never met = not counted
      introduced += 1;
      if (clampBox(r.box) >= 3) solid += 1;
    });
    var pct = introduced ? solid / introduced : 0;
    return {
      ready: introduced >= min && pct >= need,
      introduced: introduced, solid: solid, pct: pct,
      needIntroduced: min, needPct: need,
    };
  }

  // ---- sprint bests + parent settings -------------------------------------
  // Personal best only. Nothing here is ever compared between kids, and the
  // shape deliberately has nowhere to put another kid's number.
  var DEFAULT_SETTINGS = { sprintSeconds: 60, sprintTarget: 40 };
  function settings(state, kidId) {
    var kid = kidState(state || loadState(), kidId);
    var s = kid.settings || {};
    return {
      sprintSeconds: s.sprintSeconds || DEFAULT_SETTINGS.sprintSeconds,
      sprintTarget: s.sprintTarget || DEFAULT_SETTINGS.sprintTarget,
    };
  }
  function setSettings(kidId, patch) {
    var s = loadState();
    var kid = kidState(s, kidId);
    kid.settings = kid.settings || {};
    if (patch && patch.sprintSeconds) kid.settings.sprintSeconds = Math.max(15, Math.min(300, Math.round(patch.sprintSeconds)));
    if (patch && patch.sprintTarget) kid.settings.sprintTarget = Math.max(5, Math.min(200, Math.round(patch.sprintTarget)));
    saveState(s);
    return settings(s, kidId);
  }
  function sprintBest(state, kidId, deckId) {
    var kid = kidState(state || loadState(), kidId);
    return (kid.sprints || {})[deckId] || null;
  }
  function recordSprint(kidId, deckId, run) {
    run = run || {};
    var s = loadState();
    var kid = kidState(s, kidId);
    kid.sprints = kid.sprints || {};
    var prev = kid.sprints[deckId] || { best: 0, runs: 0 };
    var score = Math.max(0, Math.round(run.score || 0));
    var beat = score > (prev.best || 0);
    kid.sprints[deckId] = {
      best: Math.max(prev.best || 0, score),
      last: score,
      runs: (prev.runs || 0) + 1,
      seconds: run.seconds || DEFAULT_SETTINGS.sprintSeconds,
      at: typeof run.now === "number" ? run.now : Date.now(),
    };
    saveState(s);
    return { best: kid.sprints[deckId].best, score: score, beat: beat, runs: kid.sprints[deckId].runs };
  }

  // ---- reporting ----------------------------------------------------------
  function summarize(answers) {
    var a = answers || [], right = 0, fast = 0;
    for (var i = 0; i < a.length; i++) {
      if (a[i] && a[i].correct) right++;
      if (a[i] && a[i].correct && isFast(a[i].ms)) fast++;
    }
    return {
      total: a.length, right: right, wrong: a.length - right, fast: fast,
      accuracy: a.length ? right / a.length : 0,
    };
  }
  function progress(deck, ds) {
    var items = (deck && deck.items) || [], recs = (ds && ds.items) || {};
    var boxes = [0, 0, 0, 0, 0, 0], started = 0, mastered = 0;
    for (var i = 0; i < items.length; i++) {
      var rec = recs[items[i].id];
      if (!rec || !rec.seen) { boxes[0]++; continue; }
      started++;
      var b = clampBox(rec.box);
      boxes[b]++;
      if (b >= MAX_BOX) mastered++;
    }
    return { total: items.length, started: started, mastered: mastered, boxes: boxes };
  }
  // ONE ledger row per finished session (Session 8B's learning_events).
  // Practice deliberately does NOT log 20 rows a session — a session is the
  // unit. `correct` means the kid got more right than wrong in it; the
  // per-item detail that drives the boxes stays in localStorage, where it
  // belongs. `question_id` in the ledger is a uuid column, so it stays null.
  function sessionEvent(deck, answers) {
    var s = summarize(answers);
    return {
      subject: (deck && deck.subject) || "reading",
      skill: (deck && deck.skill) || (deck && deck.id) || null,
      grade: (deck && deck.grade) || null,
      quizType: "practice",
      correct: s.right > s.wrong,
      game: "practice",
      summary: s,
    };
  }

  var API = {
    STORE_KEY: STORE_KEY, FAST_MS: FAST_MS, MAX_BOX: MAX_BOX, MIN_BOX: MIN_BOX,
    BOX_DAYS: BOX_DAYS, SESSION_SIZE: SESSION_SIZE, MAX_NEW: MAX_NEW, REQUEUE_GAP: REQUEUE_GAP,
    nextBox: nextBox, dueAt: dueAt, isFast: isFast, clampBox: clampBox,
    newRecord: newRecord, applyAnswer: applyAnswer,
    buildSession: buildSession, requeue: requeue, choices: choices, shuffle: shuffle,
    answerOf: answerOf, sayOf: sayOf,
    loadState: loadState, saveState: saveState, kidState: kidState, deckState: deckState,
    recordAnswer: recordAnswer,
    PLACED_BOX: PLACED_BOX, PLACEMENT_PER_DECK: PLACEMENT_PER_DECK,
    buildPlacement: buildPlacement, placementResult: placementResult,
    applyPlacement: applyPlacement, placement: placement, clearPlacement: clearPlacement,
    level: level, setLevel: setLevel,
    masteredByDeck: masteredByDeck, masteredTotal: masteredTotal, deckComplete: deckComplete,
    SPRINT_READY_PCT: SPRINT_READY_PCT, SPRINT_MIN_INTRODUCED: SPRINT_MIN_INTRODUCED,
    sprintReadiness: sprintReadiness, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    settings: settings, setSettings: setSettings, sprintBest: sprintBest, recordSprint: recordSprint,
    summarize: summarize, progress: progress, sessionEvent: sessionEvent,
  };

  root.BuildablePractice = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
