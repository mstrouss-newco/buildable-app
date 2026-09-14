// buildable-sync.js (SY1) — the progress follows the KID, not the device.
//
// WHY THIS EXISTS. Minute Math scores and Practice boxes were kept in
// localStorage, which means they live in one browser on one device. A kid
// practises on the iPad; a parent opens the dashboard on their own phone and
// sees an empty screen. That is not a bug in the dashboard, it is where the
// data was.
//
// This is the thinnest possible bridge to /api/kid-progress:
//
//   BuildableSync.pull(kidId)          -> { minutemath, practice } | null
//   BuildableSync.push(kidId, part)    -> merged blob | null   (part may hold
//                                         just one half; the server merges)
//   BuildableSync.enabled(kidId)       -> is there anything to sync for?
//
// THREE RULES, all of them about not hurting a child mid-sentence:
//   1. Every failure is silent and returns null. The page carries on from its
//      local copy. A kid never sees a sync error, ever.
//   2. The SERVER merges, this does not. Two devices is the entire point, so
//      "whoever saved last wins" would throw away an afternoon of practice.
//   3. Pushes are debounced and coalesced. Fifty answers in one minute is one
//      request, not fifty.
(function (g) {
  var API = "/api/kid-progress";
  var BS = { _timer: null, _pending: null, _kid: null, _inflight: false };

  BS.enabled = function (kidId) { return !!kidId && kidId !== "guest"; };

  BS.pull = function (kidId) {
    if (!BS.enabled(kidId)) return Promise.resolve(null);
    return fetch(API + "?kidProfileId=" + encodeURIComponent(kidId), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && j.ok && j.data) ? j.data : null; })
      .catch(function () { return null; });
  };

  function send(kidId, part) {
    BS._inflight = true;
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kidProfileId: kidId, data: part }),
      keepalive: true,          // survives the page being closed mid-save
    })
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && j.ok && j.data) ? j.data : null; })
      .catch(function () { return null; })
      .then(function (v) { BS._inflight = false; return v; });
  }

  // Immediate, for the moments that matter (a finished quiz, leaving the page).
  BS.push = function (kidId, part) {
    if (!BS.enabled(kidId) || !part) return Promise.resolve(null);
    return send(kidId, part);
  };

  // Debounced, for the moments that do not (every single answer).
  BS.queue = function (kidId, getPart, wait) {
    if (!BS.enabled(kidId)) return;
    BS._kid = kidId; BS._pending = getPart;
    clearTimeout(BS._timer);
    BS._timer = setTimeout(function () {
      var fn = BS._pending; BS._pending = null;
      if (fn) send(BS._kid, fn());
    }, wait || 4000);
  };

  // A tab going away should not lose the last few answers.
  BS.flush = function () {
    if (!BS._pending || !BS._kid) return;
    var fn = BS._pending; BS._pending = null;
    clearTimeout(BS._timer);
    try { send(BS._kid, fn()); } catch (e) {}
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") BS.flush();
    });
    if (typeof window !== "undefined") window.addEventListener("pagehide", BS.flush);
  }

  g.BuildableSync = BS;
})(typeof window !== "undefined" ? window : globalThis);
