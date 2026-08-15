## Autopilot — 2026-08-15 — card FL10

**Needs you first:** nothing.

**What got built:** In Sky Flyer, the end-of-quest choice (Do it again / Keep flying) is gone. The reward moment still plays (sticker, coins, DID YOU KNOW), then the card fades on its own after ~4.5s and drops straight back into free flight. A tap anywhere skips the beat. The quest is still standing in the world — playing it again is flying back to its beam and saying yes, exactly like finding it the first time. QA: passed (`qa-skyflyer.mjs`, all 516 checks, including four new FL10 checks).

**Calls I made for you:** The beat is 4500ms (`FACT_BEAT_MS` in `public/skyflyer-engine.html`) — long enough for a grown-up to read the fun fact aloud without the kid getting bored. Change it by editing that constant. I also added a tap-anywhere skip so an impatient kid or grown-up can move on early. And I set `declined[JOB.id]=time` on completion so the offer does not re-pop the instant the card closes if you happen to still be sitting on the pad — you have to fly off and back, which matches the "finding it the first time" framing in the card. jsdom was moved to devDependencies since it is a QA-only dep and does not need to ship in production.
