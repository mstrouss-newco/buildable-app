# Playing the farm, on purpose, in a test

These four files are how the farm gets QA'd now. They drive the REAL game in a
real Chromium, with real key presses, and report what a player would actually
experience. They are what found the broken feeding in FM17 and the dead arrow
keys in FM18.

## The one trick that makes it possible

`?nodraw=1` turns off `renderer.render` and leaves the game loop running. With
the software renderer the farm draws at about 1.3 frames a second, which makes
every walking test meaningless (a held key moves her a third of a unit and the
test concludes the keys are broken). With `nodraw` the same page runs at 60.
Screenshots need drawing, so:

- looks -> draw, one frame, screenshot
- behaviour -> `?nodraw=1`, play it properly

## The files

- `serve.py` - serves a copy of the farm plus its models on :8099, and stands in
  for `/api/asset-studio` because the cloud box cannot reach buildablekids.com.
  The stand-in pictures must be flood-filled transparent from the corners first
  or every card renders as a white square and hides its own frame.
- `playthrough.mjs` - plays a whole session with the arrow keys: walk to a bed,
  plant, wait, harvest, carry to the crate, find a hungry animal, feed it. Prints
  what happened at each step and any JS error.
- `dumbwalk.mjs` - a player who only ever holds the arrow pointing at the thing
  they want. No going round, no tapping. If the farm can be played on a keyboard
  this passes; before FM18 it could not get through a gate.
- `qa17.mjs` - the tight functional pass: ready -> harvest -> patch clears,
  produce on the grass -> picked up, crate takes what it asked for.

## The dev hook

The game's internals are not on `window`. To reach them, copy the served file and
insert a `window.__DEV = {...}` object immediately before `window.FARM = {`.
Patch the SERVED COPY ONLY, never the file that ships.
