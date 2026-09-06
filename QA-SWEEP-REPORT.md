# QA-SWEEP-REPORT.md

Written by `scripts/qa-all.mjs` — 2026-09-06 15:28:08 UTC. Took 561s.

This file is generated. Do not hand-edit it: re-run `npm run qa`.

## Serving check — every shipped file has a route in `vercel.json`

**3 pass · 0 fail**

| Check | Result | Detail |
|---|---|---|
| the catch-all is last | PASS | route 198 of 198 |
| every public/buildable-*.js is routed | PASS | 19 shared scripts |
| every public/*.html is routed | PASS | 57 pages |

The live check did not run. Add `--live` before a release.

## Machine sweep — 55 harnesses

**51 pass · 2 fail · 0 timeout · 2 quarantined**

| Harness | Result | Time |
|---|---|---|
| `qa-ap2-use-in-game.mjs` | QUAR | 0.1s |
| `qa-art-browser.mjs` | PASS | 29.9s |
| `qa-art.mjs` | PASS | 0.1s |
| `qa-bingo.mjs` | PASS | 0.3s |
| `qa-breaker.mjs` | PASS | 1.4s |
| `qa-bubble.mjs` | PASS | 5.6s |
| `qa-castleguard.mjs` | PASS | 10.4s |
| `qa-checkers-dom.mjs` | PASS | 2.0s |
| `qa-checkers.mjs` | PASS | 2.5s |
| `qa-chess.mjs` | PASS | 52.2s |
| `qa-connectfour.mjs` | PASS | 0.8s |
| `qa-croc.mjs` | PASS | 0.0s |
| `qa-dive.mjs` | PASS | 0.1s |
| `qa-dotsandboxes.mjs` | PASS | 1.7s |
| `qa-explore.mjs` | PASS | 0.1s |
| `qa-family-town.mjs` | PASS | 0.1s |
| `qa-farm.mjs` | FAIL | 0.5s |
| `qa-invite.mjs` | PASS | 0.0s |
| `qa-kidspedia.mjs` | PASS | 0.1s |
| `qa-kits.mjs` | PASS | 0.1s |
| `qa-kp3-add-a-kit.mjs` | FAIL | 0.1s |
| `qa-lessons-dom.mjs` | QUAR | 0.5s |
| `qa-lessons.mjs` | PASS | 0.1s |
| `qa-mahjong.mjs` | PASS | 0.7s |
| `qa-mathcannon.mjs` | PASS | 0.1s |
| `qa-maze.mjs` | PASS | 3.6s |
| `qa-memory.mjs` | PASS | 0.2s |
| `qa-music.mjs` | PASS | 0.1s |
| `qa-nv1.mjs` | PASS | 0.1s |
| `qa-nv2.mjs` | PASS | 0.1s |
| `qa-nv3.mjs` | PASS | 0.1s |
| `qa-nv4-dom.mjs` | PASS | 0.5s |
| `qa-nv4.mjs` | PASS | 0.1s |
| `qa-practice-shot.mjs` | PASS | 43.7s |
| `qa-practice.mjs` | PASS | 30.4s |
| `qa-question-bank.mjs` | PASS | 0.1s |
| `qa-quickgame.mjs` | PASS | 0.1s |
| `qa-rileys.mjs` | PASS | 0.1s |
| `qa-rn1.mjs` | PASS | 4.0s |
| `qa-runner.mjs` | PASS | 0.1s |
| `qa-skyflyer-hud.mjs` | PASS | 42.5s |
| `qa-skyflyer-look.mjs` | PASS | 122.1s |
| `qa-skyflyer-sky.mjs` | PASS | 16.5s |
| `qa-skyflyer.mjs` | PASS | 67.3s |
| `qa-sling.mjs` | PASS | 83.6s |
| `qa-snakes.mjs` | PASS | 0.4s |
| `qa-stringmatch.mjs` | PASS | 3.0s |
| `qa-survival.mjs` | PASS | 2.6s |
| `qa-tank.mjs` | PASS | 4.1s |
| `qa-tennis.mjs` | PASS | 0.2s |
| `qa-tictactoe.mjs` | PASS | 8.1s |
| `qa-topic.mjs` | PASS | 0.2s |
| `qa-tumble.mjs` | PASS | 13.6s |
| `qa-typing.mjs` | PASS | 0.3s |
| `qa-weather.mjs` | PASS | 0.1s |

### Detail

#### `qa-ap2-use-in-game.mjs` — QUAR (quarantined: asserts 2 .useg buttons on the Browse page; it now renders 307, so the stub no longer reflects the page, card QA10)

```
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/claude/.npm-global/lib/node_modules/playwright/index.js' imported from /home/user/buildable-app/qa-ap2-use-in-game.mjs
    at finalizeResolution (node:internal/modules/esm/resolve:275:11)
    at moduleResolve (node:internal/modules/esm/resolve:861:10)
    at defaultResolve (node:internal/modules/esm/resolve:985:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:731:20)
    at ModuleLoader.resolve (node:internal/modules/esm/loader:708:38)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:310:38)
    at ModuleJob._link (node:internal/modules/esm/module_job:182:49) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///home/claude/.npm-global/lib/node_modules/playwright/index.js'
}
Node.js v22.22.2
```

#### `qa-farm.mjs` — FAIL

```
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^
browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     npx playwright install                                 ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
    at /home/user/buildable-app/qa-farm.mjs:65:32 {
  log: [],
  name: 'Error'
}
Node.js v22.22.2
```

#### `qa-kp3-add-a-kit.mjs` — FAIL

```
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/claude/.npm-global/lib/node_modules/playwright/index.js' imported from /home/user/buildable-app/qa-kp3-add-a-kit.mjs
    at finalizeResolution (node:internal/modules/esm/resolve:275:11)
    at moduleResolve (node:internal/modules/esm/resolve:861:10)
    at defaultResolve (node:internal/modules/esm/resolve:985:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:731:20)
    at ModuleLoader.resolve (node:internal/modules/esm/loader:708:38)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:310:38)
    at ModuleJob._link (node:internal/modules/esm/module_job:182:49) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///home/claude/.npm-global/lib/node_modules/playwright/index.js'
}
Node.js v22.22.2
```

#### `qa-lessons-dom.mjs` — QUAR (quarantined: same pre-NV2 Home assertions as qa-lessons.mjs, card QA11)

```
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^
browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     npx playwright install                                 ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
    at /home/user/buildable-app/qa-lessons-dom.mjs:112:32 {
  log: [],
  name: 'Error'
}
Node.js v22.22.2
```

## Page sweep — every `public/**/*.html`

**57 clean · 0 with problems** (console errors, uncaught errors, or missing files).

| Page | Result | Problems | Expected-missing |
|---|---|---|---|
| `/antcity-art-gallery.html` | PASS |  |  |
| `/art-studio.html` | PASS |  |  |
| `/asset-library.html` | PASS |  |  |
| `/audio-check.html` | PASS |  |  |
| `/audio-watch.html` | PASS |  |  |
| `/bingo-engine.html` | PASS |  |  |
| `/breaker-engine.html` | PASS |  |  |
| `/bubble-engine.html` | PASS |  |  |
| `/buildable-checkers.html` | PASS |  |  |
| `/buildable-chess.html` | PASS |  |  |
| `/castle-guard.html` | PASS |  |  |
| `/cobuild.html` | PASS |  |  |
| `/connectfour-engine.html` | PASS |  |  |
| `/croc-engine.html` | PASS |  |  |
| `/croctot.html` | PASS |  |  |
| `/dive.html` | PASS |  |  |
| `/dotsboxes-engine.html` | PASS |  |  |
| `/editor.html` | PASS |  |  |
| `/family-town.html` | PASS |  |  |
| `/feedback.html` | PASS |  |  |
| `/kidspedia.html` | PASS |  |  |
| `/landing.html` | PASS |  |  |
| `/lesson-review.html` | PASS |  |  |
| `/lessons.html` | PASS |  |  |
| `/mahjong-engine.html` | PASS |  |  |
| `/mathcannon-engine.html` | PASS |  |  |
| `/maze-engine.html` | PASS |  |  |
| `/memory-engine.html` | PASS |  |  |
| `/minutemath.html` | PASS |  |  |
| `/orbit-explorer.html` | PASS |  |  |
| `/partner.html` | PASS |  |  |
| `/planner.html` | PASS |  |  |
| `/play-invite.html` | PASS |  |  |
| `/play.html` | PASS |  |  |
| `/practice.html` | PASS |  |  |
| `/question-review.html` | PASS |  |  |
| `/rileys-garden.html` | PASS |  |  |
| `/runner-engine.html` | PASS |  |  |
| `/skyflyer-engine.html` | PASS |  |  |
| `/skyflyer-farm.html` | PASS |  |  |
| `/skyflyer-mock.html` | PASS |  |  |
| `/sling-squad.html` | PASS |  |  |
| `/snakes-engine.html` | PASS |  |  |
| `/song.html` | PASS |  |  |
| `/soundboard.html` | PASS |  |  |
| `/story-directions-cabin.html` | PASS |  |  |
| `/story-directions.html` | PASS |  |  |
| `/story.html` | PASS |  |  |
| `/string-match.html` | PASS |  |  |
| `/survival-engine.html` | PASS |  |  |
| `/tank-engine.html` | PASS |  |  |
| `/tennis.html` | PASS |  |  |
| `/tictactoe-engine.html` | PASS |  |  |
| `/topic.html` | PASS |  | 4 |
| `/tumble-engine.html` | PASS |  |  |
| `/typing.html` | PASS |  |  |
| `/weather.html` | PASS |  |  |

### Expected-missing — 4 requests, not counted as failures

- `^\/explore\/topic-photos\/` — RP1 forward-declares per-fact art in the book JSON before the photo lands, the same way bookshelf.json lists all 20 books from day one; topic.html renders every one of these through an onerror fallback, so a kid sees the painted panel, never a broken image

These are listed so the exemption stays visible. If one stops being
true, delete its entry in `scripts/qa-all.mjs` and the gate goes red.

