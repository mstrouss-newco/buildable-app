# FM16 — ready to apply, not yet shipped

Everything in this change is written and tested (11 of 11 checks green in a real
Chromium render of the real page). It has NOT been pushed, because the git push
route broke: the repo's credential helper is a script that lived in /tmp on the
Cowork machine and that folder was wiped, and the cloud route is refused by the
git proxy ("not in this session's authorized repository set").

## How to finish it

From a session that can push to `mstrouss-newco/buildable-app`:

    python3 FM16-apply.py <repo>/public/skyflyer-farm.html

Then bump the cache-bust in two places, fm14 -> fm16:

    public/skyflyer-farm.html      version: "fm14",
    src/BuildableKids.jsx          skyflyer-farm.html?v=fm14

Commit and push to main. Vercel takes about three minutes.

## What it does

**The pictures.** Every item picture in the interface now comes through one
helper, `itemPic(kind, size, cls)`, which draws the PAINTED picture over the
hand-drawn SVG and hides the SVG once the painted one loads. If the painted one
never arrives the SVG was never removed and the farm looks exactly as it did.
That is the shared-library law: read on render, always with a local fallback.

The painted set is already generated and already live. It was made through the
app's own generator (`/api/asset-studio`, action `generate`, one call for a
whole sheet), sliced, and kept in the shared asset library. Fourteen farm items
plus a spare apple and plum, served at:

    /api/asset-studio?asset=farm/items/painted/<kind>

Call sites swapped: the order card slots, the seed picker card, the sticker
book, and the want cards floating over animals, the crate and the delivery
truck. The 3D models in the WORLD are untouched.

**Three logic faults, all found by driving the real game with tests.**

1. The crate called her for ANYTHING in her hands. Carrying a wheat while the
   crate wanted corn laid a line of arrows to a box that shakes its head at you
   when you arrive. It now only calls for something `orderNeeds()` says it
   wants. (Mike: "it says to plant but points at the place to drop items I dont
   have".)
2. The "tap a dirt patch to plant a seed" hint stayed up while those arrows
   pulled the other way. Two instructions at once. The hint now stands down the
   moment the crate has something to say.
3. She filled the last slot while holding spares and the order card buzzed
   "wrong thing" at her in the same second it went green. The guard was using
   `orderFull()`, which is false for a beat while the last item is still flying
   through the air, which is exactly when the buzz landed. The test is now
   whether the crate still wants anything at all, claimed or not.

**The want card** is now made of the same stuff as the order card at the bottom
of the screen: cream #fffef7, a sand slot #f6efd6 inside a tan frame #cbb887,
generous corners, a soft shadow, and a tail pointing at whoever is asking.
FM14's white box with a heavy navy border looked like a sticker dropped on the
farm.

## What was checked

Painted picture loads over the drawn one and the drawn one survives as the
fallback; nothing calls her with empty hands; the crate stays quiet for
something it does not want and speaks for something it does; the hint stands
down; the want card holds the painted picture; the order still fills; no buzz
once the order is full; the FM13 water wall still stops her.

Also verified separately and NOT changed, because they are already right:
nothing she carries is ever eaten by the crate, she can never be stuck with no
coins and no seeds (the free-seed floor), and an order never asks for something
she cannot grow.

## Standing rule set on 2026-09-18

Do not hand-draw art for this app. Use the app's own image generator and keep
the result in the shared asset library.
