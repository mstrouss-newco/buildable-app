## Autopilot — 2026-08-15 — card FL11

**Needs you first:** nothing.

**What got built:** In Sky Flyer's puffin bird-transform quest, the fish a kid catches and carries home to the chicks used to look like plain cubes in the beak. They are now real fish — the same hand-built model that arcs out of the island lagoons in AR1Q, so both places show one animal. Silvery-blue against the puffin's red belly, sized up so a kid spots them from the air, shiny enough that the specular highlight moves across each fish as the puffin banks, and wiggling in the beak (a tail sweep + a small flop) so they are obviously alive. FL13's jumping-fish reaction can reuse this model without any extra work. QA: passed (`qa-skyflyer.mjs`, all 524 checks, including 8 new FL11 checks).

**Calls I made for you:** I honoured the FL5b law rather than shortcutting — the shape comes from a new `carry:"fish"` field on the puffin quest's cargo recipe, and `buildCargo` dispatches on it just like `styleBody` dispatches on `style`. This means adding a fish carriable to another quest costs one recipe field, no engine change. The other option was to hard-code "if it is the puffin quest, draw fish", which was faster to write and would have quietly poisoned every future quest that wanted the same. I also left the pollen/seed/letter carriables as boxes — the card was scoped to the fish, and every one of those still has a good enough SVG icon on the offer card; a future card can hand any of them a `carry` name and it drops through the same gate. The cargo material is a new phong (shininess 110, mild emissive) rather than the shared HB material, so the shine reads at 30 units up without changing what the lagoon fish look like from close.

## Autopilot — 2026-08-15 — card FL10

**Needs you first:** nothing.

**What got built:** In Sky Flyer, the end-of-quest choice (Do it again / Keep flying) is gone. The reward moment still plays (sticker, coins, DID YOU KNOW), then the card fades on its own after ~4.5s and drops straight back into free flight. A tap anywhere skips the beat. The quest is still standing in the world — playing it again is flying back to its beam and saying yes, exactly like finding it the first time. QA: passed (`qa-skyflyer.mjs`, all 516 checks, including four new FL10 checks).

**Calls I made for you:** The beat is 4500ms (`FACT_BEAT_MS` in `public/skyflyer-engine.html`) — long enough for a grown-up to read the fun fact aloud without the kid getting bored. Change it by editing that constant. I also added a tap-anywhere skip so an impatient kid or grown-up can move on early. And I set `declined[JOB.id]=time` on completion so the offer does not re-pop the instant the card closes if you happen to still be sitting on the pad — you have to fly off and back, which matches the "finding it the first time" framing in the card. jsdom was moved to devDependencies since it is a QA-only dep and does not need to ship in production.
