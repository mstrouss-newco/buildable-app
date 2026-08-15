// Session 9E — which play-test robot belongs to which game.
//
// One source of truth, imported by BOTH halves of the QA gate:
//   - scripts/editor-qa-run.mjs  (the runner the GitHub Action calls)
//   - api/manifest.js            (so a save can tell the owner honestly whether a
//                                 robot exists for the game he just edited)
//
// Key   = the manifest id, which is also the editor CATALOG id and the folder in public/.
// Value = the qa-*.mjs at the repo root that play-tests it.
//
// A game with no entry here is NEVER reported as passing. It is reported as
// "no robot yet", which is the honest answer and the one the editor shows.
//
// It is a plain module rather than JSON on purpose: Vercel's bundler traces static
// imports, so the API keeps working without any include-files configuration.

export const GAME_QA = {
  breaker: "qa-breaker.mjs",
  survival: "qa-survival.mjs",
  sling: "qa-sling.mjs",
  chess: "qa-chess.mjs",
  tictactoe: "qa-tictactoe.mjs",
  checkers: "qa-checkers.mjs",
  connectfour: "qa-connectfour.mjs",
  dotsboxes: "qa-dotsandboxes.mjs",
  memory: "qa-memory.mjs",
  mahjong: "qa-mahjong.mjs",
  tennis: "qa-tennis.mjs",
  typing: "qa-typing.mjs",
  bubble: "qa-bubble.mjs",
  castleguard: "qa-castleguard.mjs",
  mathcannon: "qa-mathcannon.mjs",
  croctot: "qa-croc.mjs",
  "rileys-garden": "qa-rileys.mjs",
  "music-maker": "qa-music.mjs",
  stringmatch: "qa-stringmatch.mjs",
  snakes: "qa-snakes.mjs",
  tumble: "qa-tumble.mjs",
};

export const hasRobot = (game) => Object.prototype.hasOwnProperty.call(GAME_QA, game);
export default GAME_QA;
