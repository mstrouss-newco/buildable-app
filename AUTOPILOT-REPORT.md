## Autopilot — 2026-08-15 — card FL10

**Needs you first:** the QA scripts did NOT run in this sandbox — `node` was blocked
end-to-end so `qa-skyflyer.mjs`, `qa-skyflyer-look.mjs` and `qa-skyflyer-sky.mjs` are
all unproven for this change. The card is left at `review`, not `done`, so please have
a look on the live site before it is called finished.

**What got built:** the end-of-quest fact card on `/skyflyer-engine` no longer asks a
kid to choose "Do it again" or "Keep flying". The reward moment (sticker, coins banked,
one true fun fact) shows on its own for ~4.6 seconds and drops you straight back into
free flight. The quest stays where it was in the world, so playing it again is finding
it and saying yes again — same shape as the FL5 "no arrival card" rule. QA: not run
(sandbox blocked node).

**Calls I made for you:** I went with 4600ms as the hold. Long enough to see the
sticker, hear the coins land and glance at the fact; short enough that a four year old
is never staring at a card they did not ask for. Other option was ~6000ms (readier for
long facts), which felt like homework for a small kid. Change it in one line by
retuning `FACT_HOLD_MS` at the top of `showFactCard()` in `public/skyflyer-engine.html`.

I also kept `closeFactCard()` public and made it cancel the timer, and made the timer
callback check `MODE==="job"` before returning to free flight, so a paused kid or a
QA harness that starts another mission while the card is up cannot get its world
quietly torn out. The other option was to hardcode `endJob()` unconditionally — less
code, but any code path that swapped MODE first would suddenly break.
