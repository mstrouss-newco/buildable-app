# QA-SWEEP-REPORT.md

Written by `scripts/qa-all.mjs` — 2026-09-06 16:07:09 UTC. Took 610s.

This file is generated. Do not hand-edit it: re-run `npm run qa`.

## Serving check — every shipped file has a route in `vercel.json`

**3 pass · 0 fail**

| Check | Result | Detail |
|---|---|---|
| the catch-all is last | PASS | route 198 of 198 |
| every public/buildable-*.js is routed | PASS | 19 shared scripts |
| every public/*.html is routed | PASS | 57 pages |

The live check did not run. Add `--live` before a release.

## Machine sweep — 60 harnesses

**59 pass · 0 fail · 0 timeout · 1 quarantined**

| Harness | Result | Time |
|---|---|---|
| `qa-ap2-use-in-game.mjs` | QUAR | 4.7s |
| `qa-art-browser.mjs` | PASS | 28.4s |
| `qa-art.mjs` | PASS | 0.1s |
| `qa-bingo.mjs` | PASS | 0.2s |
| `qa-breaker.mjs` | PASS | 1.4s |
| `qa-bubble.mjs` | PASS | 5.1s |
| `qa-castleguard.mjs` | PASS | 9.5s |
| `qa-checkers-dom.mjs` | PASS | 1.2s |
| `qa-checkers.mjs` | PASS | 2.4s |
| `qa-chess.mjs` | PASS | 13.3s |
| `qa-connectfour.mjs` | PASS | 0.8s |
| `qa-croc.mjs` | PASS | 0.0s |
| `qa-dive.mjs` | PASS | 0.1s |
| `qa-dotsandboxes.mjs` | PASS | 1.5s |
| `qa-explore.mjs` | PASS | 0.1s |
| `qa-family-town.mjs` | PASS | 0.1s |
| `qa-farm.mjs` | PASS | 19.1s |
| `qa-invite.mjs` | PASS | 0.1s |
| `qa-kidspedia.mjs` | PASS | 0.1s |
| `qa-kits.mjs` | PASS | 0.1s |
| `qa-kp3-add-a-kit.mjs` | PASS | 6.1s |
| `qa-lessons-dom.mjs` | PASS | 200.4s |
| `qa-lessons.mjs` | PASS | 0.1s |
| `qa-mahjong.mjs` | PASS | 0.7s |
| `qa-mathcannon.mjs` | PASS | 0.0s |
| `qa-maze.mjs` | PASS | 3.1s |
| `qa-memory.mjs` | PASS | 0.2s |
| `qa-minutemath.mjs` | PASS | 0.1s |
| `qa-music.mjs` | PASS | 0.1s |
| `qa-nv1.mjs` | PASS | 0.1s |
| `qa-nv2.mjs` | PASS | 0.1s |
| `qa-nv3.mjs` | PASS | 0.1s |
| `qa-nv4-dom.mjs` | PASS | 0.5s |
| `qa-nv4.mjs` | PASS | 0.1s |
| `qa-play-invite.mjs` | PASS | 0.1s |
| `qa-play.mjs` | PASS | 0.1s |
| `qa-practice-shot.mjs` | PASS | 42.9s |
| `qa-practice.mjs` | PASS | 30.4s |
| `qa-question-bank.mjs` | PASS | 0.1s |
| `qa-quickgame.mjs` | PASS | 0.1s |
| `qa-rileys.mjs` | PASS | 0.1s |
| `qa-rn1.mjs` | PASS | 3.9s |
| `qa-runner.mjs` | PASS | 0.1s |
| `qa-share-links.mjs` | PASS | 0.0s |
| `qa-skyflyer-hud.mjs` | PASS | 36.7s |
| `qa-skyflyer-look.mjs` | PASS | 115.3s |
| `qa-skyflyer-sky.mjs` | PASS | 13.4s |
| `qa-skyflyer.mjs` | PASS | 56.1s |
| `qa-sling.mjs` | PASS | 75.8s |
| `qa-snakes.mjs` | PASS | 0.4s |
| `qa-soundboard.mjs` | PASS | 0.1s |
| `qa-stringmatch.mjs` | PASS | 2.1s |
| `qa-survival.mjs` | PASS | 2.9s |
| `qa-tank.mjs` | PASS | 3.2s |
| `qa-tennis.mjs` | PASS | 0.2s |
| `qa-tictactoe.mjs` | PASS | 5.0s |
| `qa-topic.mjs` | PASS | 0.2s |
| `qa-tumble.mjs` | PASS | 9.0s |
| `qa-typing.mjs` | PASS | 0.1s |
| `qa-weather.mjs` | PASS | 0.1s |

### Detail

#### `qa-ap2-use-in-game.mjs` — QUAR (quarantined: asserts 2 .useg buttons on the Browse page; it now renders 307, so the stub no longer reflects the page, card QA10)

```
FAIL: expected 2 .useg buttons, got 307
PASS: Game picker shows 22 games
PASS: Fit filter: world offers Background, not Paddle/Bricks/Balls
PASS: Apply wrote studio id into breaker level background live (studio:breaker/background/ocean/ocean-world)
PASS: Other slots untouched by apply
PASS: Open-game link deep-links to the level
PASS: Undo restored the previous background live
PASS: Character offers actor slots, never Background
PASS: Signed-out apply prompts sign-in and writes nothing
PASS: Build tab intact: no createView, World Builder populated, New Game toggles
PASS: No JS errors on the page
AP2 QA: FAILED
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

