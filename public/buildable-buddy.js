// buildable-buddy.js (BB) — tiny bridge so a game running in an iframe can tell
// the Buildable app's helper to react. It just posts a message UP to the parent
// app, which shows the kid's chosen helper + speaks a cheer/encouragement.
// Usage in a game: BB.win()  BB.lose()  BB.levelup()  BB.cheer("Nice!")
(function () {
  function send(kind, text) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: "buildable", kind: kind, text: text || null }, "*");
      }
    } catch (e) {}
  }
  window.BB = {
    send: send,
    win: function (t) { send("win", t); },
    lose: function (t) { send("lose", t); },
    levelup: function (t) { send("levelup", t); },
    cheer: function (t) { send("cheer", t); },
  };
})();
