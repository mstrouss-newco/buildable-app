/* buildable-practice.js — the shared PRACTICE deck engine (Session PT1).
 *
 * One engine, every subject. It knows about BOXES, DUE DATES, SESSIONS and the
 * intro moment. It knows nothing about words, sums, or how a question looks on
 * screen — a deck item only has to carry a stable `id`, and the page renders
 * whatever other fields the deck put there. PT3's math decks ride THIS file;
 * do not fork it.
 *
 * The rules, straight from the card:
 *   - every item holds a per-kid box 1-5 and starts in box 1
 *   - right AND fast moves it UP a box; wrong or slow moves it DOWN
 *   - fast means under 3000ms, measured silently. NEVER show a timer.
 *   - a session is about 20 turns: due reviews first, at most 3 NEW items
 *   - a new item gets an INTRO moment before it is ever quizzed
 *   - a wrong answer is never punished, the item just comes back sooner
 *   - no lives, no score, no fail state — nothing here returns one
 *
 * Per-kid state lives in localStorage under "bk_practice_v1", keyed by kid id.
 *
 *   var s = BuildablePractice.session({ kidId: "k1", deck: deckJson });
 *   var t = s.next();                       // { item, box, isNew, needsIntro }
 *   if (t.needsIntro) s.markIntro(t.item.id);
 *   s.answer(t.item.id, true, 1840);        // correct, milliseconds
 *   s.summary();                            // { asked, right, mastered, ... }
 *
 * No emojis. No network. Nothing in here can throw at a caller: every storage
 * read is guarded, because a locked-down browser must never break practice.
 */
(function (global) {
  "use strict";

  var KEY = "bk_practice_v1";
  var VERSION = 1;
  var FAST_MS = 3000;          // under this and the answer counts as fluent
  var MIN_BOX = 1, MAX_BOX = 5;
  var DAY = 86400000;
  // Box -> how long until the item is due again. Box 1 is due immediately, so a
  // shaky item comes back in the SAME session. Box 5 is mastered and rests.
  var REST = { 1: 0, 2: 1 * DAY, 3: 2 * DAY, 4: 4 * DAY, 5: 8 * DAY };

  var SESSION_TURNS = 20;      // about 20 items in a sitting
  var MAX_NEW = 3;             // at most 3 brand new items mixed in
  var MAX_PASSES = 3;          // a tiny working set is not drilled more than this

  // ---- storage ------------------------------------------------------------
  function readAll() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(KEY) : null;
      var d = raw ? JSON.parse(raw) : null;
      if (!d || typeof d !== "object") return { v: VERSION, kids: {} };
      if (!d.kids || typeof d.kids !== "object") d.kids = {};
      return d;
    } catch (e) { return { v: VERSION, kids: {} }; }
  }
  function writeAll(d) {
    try { if (global.localStorage) global.localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }
  function kidKey(kidId) { return kidId ? String(kidId) : "_"; }

  /* A per-kid view of the box state. Rows are tiny on purpose — 220 sight words
   * plus PT3's maths facts all live in one localStorage value.
   *   b = box, due = when it is next due, n = times seen, r = times right,
   *   i = has had its intro moment, t = last answered at                      */
  function store(kidId) {
    var k = kidKey(kidId);
    var all = readAll();
    if (!all.kids[k]) all.kids[k] = { items: {}, sessions: 0, last: 0 };
    var me = all.kids[k];
    if (!me.items) me.items = {};

    function get(itemId) {
      var r = me.items[itemId];
      if (!r) return null;
      return { box: r.b || MIN_BOX, due: r.due || 0, seen: r.n || 0, right: r.r || 0, intro: !!r.i, ts: r.t || 0 };
    }
    function put(itemId, row) {
      me.items[itemId] = { b: row.box, due: row.due, n: row.seen, r: row.right, i: row.intro ? 1 : 0, t: row.ts };
    }
    return {
      kidId: k,
      raw: me,
      get: get,
      put: put,
      save: function () { all.kids[k] = me; all.v = VERSION; writeAll(all); },
      /* Every item of a deck, with its state (or a fresh box-1 row). */
      rows: function (deck) {
        return (deck && deck.items ? deck.items : []).map(function (item) {
          var st = get(item.id);
          return {
            item: item,
            box: st ? st.box : MIN_BOX,
            due: st ? st.due : 0,
            seen: st ? st.seen : 0,
            right: st ? st.right : 0,
            intro: st ? st.intro : false,
            isNew: !st || st.seen === 0,
          };
        });
      },
      /* How far through a deck the kid is. PT2's bird collection reads this. */
      progress: function (deck) {
        var rows = this.rows(deck), mastered = 0, started = 0;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].box >= MAX_BOX) mastered++;
          if (!rows[i].isNew) started++;
        }
        return { total: rows.length, started: started, mastered: mastered };
      },
    };
  }

  // ---- the box maths ------------------------------------------------------
  /* The whole rule in one pure function, so it can be checked without a DOM.
   * Right AND fast climbs. Wrong OR slow drops. Nothing else moves a box.     */
  function grade(box, correct, ms) {
    var was = clampBox(box);
    var fast = typeof ms === "number" && isFinite(ms) && ms < FAST_MS;
    var up = !!correct && fast;
    var next = clampBox(up ? was + 1 : was - 1);
    return {
      box: next, was: was, up: up, down: next < was, fast: fast,
      mastered: next >= MAX_BOX,
      // a newly mastered item is one that climbed INTO box 5 on this answer
      justMastered: next >= MAX_BOX && was < MAX_BOX,
    };
  }
  function clampBox(b) {
    b = Math.round(Number(b) || MIN_BOX);
    return b < MIN_BOX ? MIN_BOX : (b > MAX_BOX ? MAX_BOX : b);
  }
  function dueAt(box, now) {
    return (now || Date.now()) + (REST[clampBox(box)] || 0);
  }

  // ---- picking what to practise ------------------------------------------
  /* Due reviews first, then at most `maxNew` brand new items. If the kid has
   * nothing due we top up with their shakiest seen items rather than sending
   * them away — practice is always available, it just prefers what is due.   */
  function pick(rows, opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var size = opts.size || SESSION_TURNS;
    var maxNew = typeof opts.maxNew === "number" ? opts.maxNew : MAX_NEW;

    var due = [], later = [], fresh = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.isNew) fresh.push(r);
      else if (r.due <= now) due.push(r);
      else later.push(r);
    }
    // shakiest first, then the one waiting longest
    var byNeed = function (a, b) { return a.box - b.box || a.due - b.due; };
    due.sort(byNeed);
    later.sort(byNeed);

    var newOnes = fresh.slice(0, Math.max(0, maxNew));
    var room = Math.max(0, size - newOnes.length);
    var review = due.slice(0, room);
    if (review.length < room) review = review.concat(later.slice(0, room - review.length));

    return { review: review, fresh: newOnes };
  }

  /* Choices for a pick-one-of-four mode, drawn from the deck itself. Prefers
   * decoys that are a fair test (similar length, and not the same first letter
   * every time) but never returns fewer than it can. A subject whose answers
   * are COMPUTED rather than listed (PT3's sums) supplies its own choices —
   * that is why this is a helper and not baked into the session.             */
  function deckChoices(deck, item, n, rnd) {
    n = n || 4;
    rnd = rnd || Math.random;
    var pool = (deck && deck.items ? deck.items : []).filter(function (x) { return x.id !== item.id; });
    var key = function (x) { return String(x.word || x.text || x.id); };
    var len = key(item).length;
    pool.sort(function (a, b) {
      var da = Math.abs(key(a).length - len), db = Math.abs(key(b).length - len);
      if (da !== db) return da - db;
      return rnd() - 0.5;
    });
    // take from the closest half so the decoys stay varied between turns
    var near = pool.slice(0, Math.max(n * 3, Math.min(pool.length, 12)));
    shuffle(near, rnd);
    var out = near.slice(0, Math.max(0, n - 1));
    out.push(item);
    shuffle(out, rnd);
    return out;
  }

  /* Spread `fresh` evenly through `review`, never at the very front. Returns a
   * new array; either side may be empty. */
  function mixIn(review, fresh) {
    var out = review.slice();
    if (!fresh.length) return out;
    if (!out.length) return fresh.slice();
    var gap = (out.length + 1) / (fresh.length + 1);
    for (var i = 0; i < fresh.length; i++) {
      var at = Math.min(out.length, Math.max(1, Math.round(gap * (i + 1)) + i));
      out.splice(at, 0, fresh[i]);
    }
    return out;
  }

  function shuffle(a, rnd) {
    rnd = rnd || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- a sitting ----------------------------------------------------------
  function session(opts) {
    opts = opts || {};
    var deck = opts.deck || { items: [] };
    var st = opts.store || store(opts.kidId);
    var now = opts.now || Date.now();
    var rnd = opts.random || Math.random;
    var size = opts.size || SESSION_TURNS;
    var maxNew = typeof opts.maxNew === "number" ? opts.maxNew : MAX_NEW;

    var rows = st.rows(deck);
    var byId = {};
    for (var i = 0; i < rows.length; i++) byId[rows[i].item.id] = rows[i];

    var chosen = pick(rows, { now: now, size: size, maxNew: maxNew });
    // Due reviews carry the sitting; the new items are MIXED IN rather than
    // stacked at the front, so a kid warms up on words they already know before
    // meeting a new one. (With nothing due yet, the new ones are all there is.)
    var working = mixIn(chosen.review, chosen.fresh);
    var newIds = chosen.fresh.map(function (r) { return r.item.id; });

    // About `size` turns, but a tiny working set is never drilled to death.
    var turns = Math.min(size, Math.max(working.length, working.length * MAX_PASSES));
    var queue = working.map(function (r) { return r.item.id; });

    var asked = 0, right = 0, fastCount = 0, done = 0;
    var mastered = [], seenIds = {};

    function refill() {
      var again = working.map(function (r) { return r.item.id; });
      shuffle(again, rnd);
      queue = queue.concat(again);
    }

    var api = {
      deck: deck,
      kidId: st.kidId,
      turns: turns,
      newIds: newIds,
      /* How many turns are left in this sitting. Not a score — the page draws
       * it as a row of dots so a kid can see the end coming. */
      get remaining() { return Math.max(0, turns - done); },
      get done() { return done; },

      /* The next thing to put on screen, or null when the sitting is over. */
      next: function () {
        if (done >= turns) return null;
        if (!queue.length) { refill(); if (!queue.length) return null; }
        var id = queue[0];
        var row = byId[id];
        if (!row) { queue.shift(); return api.next(); }
        var cur = st.get(id);
        return {
          item: row.item,
          box: cur ? cur.box : MIN_BOX,
          isNew: newIds.indexOf(id) !== -1,
          // the intro moment happens once, the first time a kid ever meets it
          needsIntro: !(cur && cur.intro),
        };
      },

      /* The kid has met a new item: word shown big, said aloud, tricky letters
       * lit. Recording it here is what stops the intro coming back. */
      markIntro: function (itemId) {
        var cur = st.get(itemId) || { box: MIN_BOX, due: 0, seen: 0, right: 0, intro: false, ts: 0 };
        cur.intro = true;
        st.put(itemId, cur);
        st.save();
        return cur;
      },

      /* One answer. `ms` is how long the kid took, measured silently. */
      answer: function (itemId, correct, ms) {
        var cur = st.get(itemId) || { box: MIN_BOX, due: 0, seen: 0, right: 0, intro: false, ts: 0 };
        var g = grade(cur.box, correct, ms);
        var next = {
          box: g.box, due: dueAt(g.box, now), seen: cur.seen + 1,
          right: cur.right + (correct ? 1 : 0), intro: true, ts: now,
        };
        st.put(itemId, next);
        st.save();

        asked++; done++;
        if (correct) right++;
        if (g.fast) fastCount++;
        seenIds[itemId] = true;
        if (g.justMastered) mastered.push(itemId);

        // Off the front of the queue, then back into it if it needs another go.
        var at = queue.indexOf(itemId);
        if (at !== -1) queue.splice(at, 1);
        if (!g.up) {
          // not punished — it simply comes round again, a few turns from now
          queue.splice(Math.min(2, queue.length), 0, itemId);
        }
        if (!queue.length && done < turns) refill();

        return { box: g.box, was: g.was, up: g.up, fast: g.fast, mastered: g.mastered, justMastered: g.justMastered };
      },

      /* Four choices for this turn, target included, already shuffled. */
      choices: function (item, n) { return deckChoices(deck, item, n || 4, rnd); },

      /* The ids still queued, current turn first. The page uses this to warm
       * the NEXT word's audio while the kid is still on this one. */
      upcoming: function () { return queue.slice(); },

      /* What the sitting came to. One of these is posted to the learning
       * ledger; nothing here is shown to the kid as a score. */
      summary: function () {
        var ids = Object.keys(seenIds);
        return {
          deckId: deck.id || null,
          subject: deck.subject || null,
          skill: deck.skill || deck.kind || null,
          kidId: st.kidId,
          asked: asked, right: right, fast: fastCount,
          turns: turns, items: ids.length,
          newIds: newIds.slice(),
          mastered: mastered.slice(),
          progress: st.progress(deck),
        };
      },

      /* Close the sitting off in the store (session count, last-played). */
      close: function () {
        st.raw.sessions = (st.raw.sessions || 0) + 1;
        st.raw.last = now;
        st.save();
        return api.summary();
      },
    };
    return api;
  }

  var BuildablePractice = {
    KEY: KEY, VERSION: VERSION,
    FAST_MS: FAST_MS, MIN_BOX: MIN_BOX, MAX_BOX: MAX_BOX,
    SESSION_TURNS: SESSION_TURNS, MAX_NEW: MAX_NEW, REST: REST,
    grade: grade, dueAt: dueAt, pick: pick, shuffle: shuffle, mixIn: mixIn,
    deckChoices: deckChoices, store: store, session: session,
  };

  global.BuildablePractice = BuildablePractice;
  if (typeof module !== "undefined" && module.exports) module.exports = BuildablePractice;
})(typeof window !== "undefined" ? window : this);
