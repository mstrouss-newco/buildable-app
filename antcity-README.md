# Ant City - instructions

A calm, **grow-your-own ant colony** for kids. You start with a queen and a few
ants in the sandy dirt under a sunny meadow. Over days, you draw where the tunnels
should go, drop food and water, and tell your ants what jobs to do. Your digger ants
carve the tunnels for you (you never dig yourself), and the colony keeps growing in
real time, even while you are away. Nothing is ever erased and the colony never resets.
It is the kid's own little world, and a snapshot can be shared.

The point is not to win and stop, it is to keep building. Recruit more ants, dig more
rooms, and grow the colony as big as you can, a friendly ant-sized take on a
build-your-empire game. The colony can grow huge with no cap and no ending.

It is a brand-new **game type** for the Games section (a persistent colony grow game),
alongside Breaker, Survival, and Sling. Like those, it is a fixed **engine** plus a
data-driven **recipe** (`GAME_CONFIG` + the manifest): you tune numbers and pick art,
you never rewrite the game. The world is fully scripted and deterministic (no physics
engine), so the QA robot can prove every mission is beatable.

## The files (planned for this game)

- **public/antcity-engine.html** - the game itself (the colony engine, card AC1: dig,
  forage, build, assign jobs, hatch. Missions and going live are AC2).
- **public/antcity/manifest.json** - the settings sheet the shell reads (this session).
- **public/buildable-renders.js** - `BR`, shared drawn art (always-on fallback).
- **public/buildable-audio.js** - `BA`, shared sound (dig, march, hatch, munch, rain).
- **public/buildable-mechanics.js** - `BM`, shared FX/juice (dirt puffs, sparkles, pops).
- **public/buildable-feel.js** - `Feel`, the shared Feel Kit (taps, celebration card).
- **public/buildable-hud.js** - the one shared in-play info bar (no global).
- **qa-antcity.mjs** - the headless robot (card AC2): a perfect player finishes all
  ten missions, and the cartridge contract is checked with them. AC5 added a section for
  the working ants, the guide and the swarm. AC7 put a small real DOM under it, so the
  tutorial is played with the actual gestures it teaches, in a mouse profile and a touch
  profile, and "never two hints on screen" is checked after every one of them.
- **qa-antcity-shot.mjs** - the same game in real Chromium (card AC5): a real finger drag
  and a real tap walk the guide, and it writes pictures to look at. Needs Playwright, and
  skips loudly without it, so it is never mistaken for a check that ran.

## How to play

1. **Draw a tunnel path.** Drag from an open dirt spot to point where you want a new
   tunnel. Your **digger ants** walk over and carve it out over time. You never dig the
   dirt yourself, you only show the ants where to go.
2. **Drop food and water.** Tap the surface to leave a crumb or a water drop. Ants carry
   it down to the colony. Well-fed, rested ants keep working.
3. **Give ants jobs.** Every ant can be a **digger** (carves tunnels), a **forager**
   (brings food from the surface), a **nursery ant** (tends eggs and babies), or a
   **builder** (makes rooms like storage and resting dens). You slide ants between the
   four jobs to decide what the colony works on next.
4. **Grow the colony.** Eggs hatch into new ants, tunnels branch deeper, and rooms get
   built. The colony keeps ticking forward in real time, including while the app is closed.
5. **Handle gentle setbacks.** Setbacks pause progress, they never punish. A **hungry or
   sleepy ant** stops working until it is fed or rested. A **rain flood** blocks a tunnel
   until a builder clears it. Nothing is lost, the colony just waits for you to help.

There is no lose state and no game over. This is a keep-forever world, not a win-or-lose
round.

## The game teaches itself (AC5)

Nobody reads instructions, least of all a five year old. So the game explains itself while
it is being played:

- **A guided first minute.** On a brand new colony the queen walks the kid through the
  three things the colony is made of, **one at a time**, and each step **waits** until the
  kid really does it: drag in the dirt to dig, tap the grass to drop food, slide an ant to
  a new job. A pointing mark shows the exact spot. Nothing to dismiss, nothing blocked, no
  wall of text. The **?** button replays the whole thing.
- **Always-on clarity.** Every control says what it is in a word (**Dig**, **Food**,
  **Water**, **Jobs**), and the **goal strip** above the panel carries what the colony
  wants next in kid words, the whole time. Whatever is slowing the colony down (hungry,
  sleepy, flooded) takes the strip over, because that is what to go and fix.
- **A gentle nudge.** Sit still for about fifteen seconds and one friendly bubble points at
  the next thing to *do*. It never repeats what the strip is already saying, and it nudges
  rather than nags.

## Ants that mean it (AC5)

Every drawn ant is doing something the colony is really doing:

- **Pick a dig spot** and a nearby digger walks to it **through the existing tunnels**
  (never through solid dirt), and digs with dirt puffs. The marker sits on the spot, and
  brightens while an ant is actually working it.
- **Drop a crumb** and a forager climbs up and out of the anthill, picks it up in the
  carrying pose, and hauls it back down to storage.
- Ants face the way they walk, hustle when they are on a job, hop when they finish one,
  leave tiny footprints, and the queen bobs every time one of her eggs hatches.

The counts-and-rates simulation stays the **only** source of truth. Nothing in the visible
layer changes a number, so it is an honest animation on top of the colony, driven by the
same fixed 1/60 step and the same seeded random. The QA robot still repeats exactly.

**Swarm scale.** The ants are drawn small (about a third of a cell) and there are up to
seventy of them on screen, so a growing colony reads as a lively swarm of little things
rather than a handful of big ones. The drawn crowd is a *sample* taken from the part of the
colony the camera is looking at, and it wears the same job mix the panel says. The one ant
the guide is pointing at is drawn bigger with a soft halo, so it stays easy to follow.

## The strategy layer (AC6)

Ant City is a township for ants. Three things make it a game you think about rather
than a game you watch:

**Where you dig a room changes how well it works.** Storage near the top means quicker
forager trips. A nursery beside the queen hatches eggs sooner. A den dug deep gives a
better rest. A fungus garden close to home grows faster. When you tap a tunnel to build,
each room tells you in kid words whether that spot is a good one, before you commit. The
rules are **bonuses only** and live in `GAME_CONFIG.placement` as data: a plain spot earns
nothing and costs nothing, so a colony built before any of this existed carries on exactly
as it did.

**The job slider is the main lever, and the colony answers back.** Push it all the way to
diggers and the tunnels fly while the pantry drains. Push it to foragers and the food piles
up while nothing gets built. The food readout says which way it is going, and the line over
the bar says what your current mix is doing, in kid words. Rain now rewards a stocked
pantry: with food put by the colony works straight through a flood, and with an empty one it
only goes slower until a builder clears it. It still never takes anything away.

**Production chains, which are real ant science.** Leaves grow on the meadow and a forager
with no crumb to fetch goes and cuts one, then hauls it to the **Fungus Garden**, a room
tended by your nursery ants that turns leaves into mushroom food. That makes nursery duty a
real choice between eggs and mushrooms. Later a milestone brings an **aphid plant** to the
meadow and the ants herd it for honeydew. The queen shares the true fact behind each one the
first time it appears: leafcutter ants really do farm a mushroom garden rather than eat the
leaves, and ants really do keep aphids like tiny cows. The chains are gentle. Nothing rots,
nothing dies, and an unstaffed garden simply waits.

The new room and both chain milestones live in `public/antcity/manifest.json`, so the recipe
can add or retune them without touching the engine.

## Clarity: see what you do, know what to do (AC7)

AC5 and AC6 shipped and the robot was green, and the game still failed a human
playthrough. Ten things were wrong and all ten were about the same thing: the game did
not SHOW what it was doing, and it did not say clearly what to do next.

- **Food is carried, never counted.** Every edible thing on the meadow is a real item in
  a real place: a crumb the kid taps out, a berry the bush grew, a leaf, a drop of
  honeydew, a drop of water. A forager claims one, walks out of the anthill, picks it up
  (which is the moment the bush visibly loses that berry) and carries it home in its
  mandibles. **The Food number moves on ARRIVAL and at no other moment.** A tap leaves a
  crumb; it does not add food.
- **ONE hint line.** There used to be two, a goal chip and a floating pill, and they
  contradicted each other all the way through the tutorial. There is now exactly one
  surface, `#coach`, and everything comes out of it in one order: the lesson step being
  taught, then a message that just fired, then what is slowing the colony, then the
  mission. A finished step's words vanish the instant the step is done.
- **Only gestures that work are taught.** Step three used to say "slide the colour bar",
  which did nothing at all with a mouse. It now teaches the plus button on a job card,
  which cannot miss on any device, and the bar was fixed anyway: a press anywhere on it
  takes hold of the nearest divider, on mouse and on touch.
- **No unexplained modes.** Dig and Jobs were never modes (you dig by dragging in the
  dirt, you set jobs on the strip), so those tabs are gone. What is left is **Build**,
  **Food** and **Water**, and the lit one is what a tap on the meadow leaves behind. Each
  one is a picture first — the crumb, the drop of water and the room are drawn on the
  button as the same shapes the game really puts on the meadow, so a kid who cannot read
  yet still knows what a tap will leave — with the word beside it for one who can. Drawn
  SVG geometry, no glyphs. Water now goes somewhere you can see: its own meter.
- **A needs panel.** Four slim always-on meters: food, water, rest, eggs. One that runs
  low flags itself and hands the hint line a sentence about what to do.
- **Build is a button.** Rooms were undiscoverable because the only way in was to tap a
  tunnel and hope. Tap **Build**, pick a room, and every spot it could go glows on the
  colony; tap one to put it there. A short second lesson teaches exactly that, the first
  time a room is available (and never while the colony is hungry).
- **Ants that go somewhere.** Every working ant walks to a marked target and animates the
  work there: diggers to the drawn spot, foragers to the item, nursery ants to the eggs or
  the mushroom garden, builders to the half-built room or the flooded tunnel. Every job in
  progress wears a marker in its job colour. **An idle ant parks and stands still.**
  Nothing wanders, a cell holds two ants at most and never a third, and nobody sits on the
  queen.
- **A slim panel.** The jobs panel was a permanent slab over the bottom half of the
  screen, hiding the very dirt the tutorial was pointing at. It is a strip that opens on a
  tap, and the engine measures the panel's REAL height every frame (it used to assume 132
  pixels while the thing on screen was far taller).
- **No level picker.** One colony, always yours: the tile opens the anthill.
- **Drawn ants.** At a third of a cell the library sprite read as an orange blob, so the
  ants are drawn: a clean silhouette with a dark outline, a job-coloured marker above, and
  the carried item in its mandibles. The art ids still come from the manifest and still
  pick the body colour, and the fallback path is untouched.

## One smart bar, and a Build menu made of pictures (AC8)

AC7 made the game honest. AC8 makes it readable by somebody who cannot read. The rule
for every element on screen: **information is bars, icons, pictures and countable things;
words are tiny labels only.**

The bottom stack was a row of words (FOOD WATER REST EGGS) over a row of word buttons.
It is now **one slim bar** with three parts:

- **Left, the meters.** Four little vertical bars with a picture on each: a green apple
  for food, a blue drop for water, a pink moon for rest, a gold egg for eggs. The one
  that is running out **wiggles and wears a small red tag**, so the thing that needs the
  player is the thing that moves.
- **Middle, what is in your hand.** One big button carrying the tool itself — a shovel, an
  apple, a drop, a hammer — its name, and two or three words saying where to use it
  ("drag in the dirt", "tap the grass"). This is the fix for the oldest confusion in the
  game: what a tap will do is now stated on screen at all times, and the tool really
  decides. A tap in the wrong place is never silent; it says which picture to swap to.
- **Right, the toolbox.** A round button that opens a sheet of four picture cards and
  hides again the moment one is picked. The guide teaches this, because it is the one new
  thing to learn: tap the round button, then pick the apple.

The **jobs strip** stays collapsed at the very bottom and opens on a tap, exactly as AC7
left it.

**The Build menu is pictures.** Four cards in a 2x2 grid, each a little scene of what the
room does: eggs in a pink room, a pile of berries, an ant asleep under a Zz, mushrooms
growing. What a room costs is **a row of apples you count**, not a number to read. A room
you cannot afford yet goes grey and its apples flash. Closing is a big orange X.

Everything AC7 built is untouched underneath: one hint line, food that only arrives when
an ant carries it in, ants that walk to marked targets and stand still when idle, straight
into the colony with no picker.

## Soldiers and bad bugs, the Bugs Life layer (AC9)

Ant City is worker ants **and soldiers**. The soldiers exist because, every so often, a
bad bug wanders in.

**A fifth job: Soldier.** It joins the jobs strip and the colour bar wearing red, the same
red the low meters already use for "this needs you". It is **not there at all** until the
colony reaches about fifteen ants, so the early game stays four-job calm; the milestone
that hands it over pops a reward and the queen shares the real science — soldier ants
really do have bigger jaws than the other ants, and they stand guard at the door of the
nest. A soldier is drawn as the same ant a size up, with a helmet and those bigger jaws.

**A bad bug visit is a rare treat.** Roughly every ten to fifteen minutes of play, scaled
by the difficulty dial, and **never during the tutorial** — the ten missions and the
first-minute lesson are finished before anything comes calling. There are three original
cartoon bugs, silly and never scary: a **beetle** that ambles down to nose at the food
store, a **caterpillar** that munches on the leaf bush, and a **grasshopper** that plants
itself by the front door so the foragers stay in.

**A visit only ever pauses one thing you can see.** The beetle pauses the quick trips the
storage room earns, the caterpillar stops the bush putting out new leaves, and the
grasshopper keeps the foragers indoors. Nothing is destroyed, nothing is taken, no ant is
lost, no store goes down and there is no timer to beat. Everything starts again the moment
the bug goes.

**The kid always knows where, and always has the answer.** A bouncing red marker at the
edge of the screen says where it is, drawn geometry rather than a word, and tapping it
takes the camera there. The one hint line says what to do. With **no soldier assigned** the
bug simply settles in and **naps on the spot it is blocking**, and waits — clear cause,
clear effect. Move one ant to Soldiers and they march over, through the tunnels if it is
down in the colony, out of the front door if it is up top. **ONE soldier always ends it**,
in about twelve seconds, and the robot proves that for every bug on every difficulty.
The bug does a comic hop away, drops a bonus crumb on the meadow and pays coins through
the shared wallet. See five off and a badge lands.

The numbers (how often, what it pays, every word each bug says) live in
`GAME_CONFIG.bug` and in `public/antcity/manifest.json`, so the recipe can retune the
visits, or add a fourth visitor, without touching the engine.

## How an ant moves, and how it looks (AC13)

Two halves, kept deliberately apart. `walkVisual` decides how an ant **moves**;
`drawAnt(x, y, angle, scale, t, opts)` decides how it **looks**. A future art style can
replace the whole body without touching a line of movement.

**Four ingredients, all four on.**

1. **Feet that grip.** Every foot is stored in WORLD space (in cells, so it stays on the
   same speck of dirt when the camera scrolls) and stays planted while the body walks past
   it. The gait clock is driven by **distance travelled**, never by a timer, so an ant
   cannot skate and a stopped ant is genuinely frozen with its feet down.
2. **Stop and go.** Walk, freeze for a beat, occasionally dart.
3. **A wobbly lane.** A slow drift either side of the trail, plus a little head casting.
4. **Traffic and hellos.** An ant steps around a slower ant in front, and an outbound and
   an inbound ant briefly touch antennae as they pass.

**Two rules that must never be regressed.**

- **Side view, not top-down.** All six legs point DOWN to the ground: three near-side at
  full strength, three far-side shorter and faded. The body is gaster, thin waist, thorax,
  head, about three times longer than tall. A round rear end plus forward mandibles reads
  as a hermit crab. Mandibles and the white eye only draw when there is room for them; at
  swarm size the eye is a plain dark dot. Antennae never thin below one screen pixel: they
  are the strongest sign that this is an ant and not a beetle.
- **Never rotate past vertical.** Rotating by heading alone flips an ant walking LEFT
  upside down. Rotate by heading, then mirror with `scale(1,-1)` when the heading points
  left, with a small dead zone so ants in a vertical shaft do not flicker, and replant the
  feet whenever the mirror flips.

The tripods are **near-front + near-back + far-middle** together, then the other three.
Grouping by side instead swings the whole near side at once and reads as two wedges
flapping.

**The crowd is the score.** The number of ants on screen IS the progress meter, with no
words. The cap (`sampleMax` 150, `sampleMaxPhone` 120) is a **painting budget**, nothing
else: over budget it is leg detail that goes first, never ants. `antScale` is 0.215 of a
cell, the 0.95x the motion lab locked. The counts-and-rates sim is unchanged and stays the
only source of truth, and the motion layer runs on its own seeded random stream so wobble
cannot shift a single roll the colony makes.

**Food you can see (AC13, folded in from the old AC11).** Every edible thing is chunky,
glossy and worth carrying, and it is the same drawing on the meadow, in an ant's mandibles
and in the pantry: fat berries with a highlight and a stalk, real cut-leaf triangles,
proper picnic crumbs, mushrooms that grow through stages and glow and bounce when ripe,
and a storage pile that grows and shrinks with the stock so the pantry is the food meter
made physical. The garden's mushrooms run on the garden's OWN clock, so they only swell
while leaves are really being turned into food.

## The colony builder loop (grow it huge)

Ant City is a kid-simple colony builder. The feel is a friendly ant version of a
build-your-empire game: more workers means more gets done, so the colony keeps growing.
The loop the kid repeats is:

1. **Gather.** Foragers bring in food, diggers open up new space.
2. **Grow.** Feeding the nursery hatches more ants (more workers).
3. **Assign.** Slide the new ants across the four jobs to decide what to work on.
4. **Build.** Dig more tunnels and build more rooms (nursery, storage, den, and more).
5. **Repeat, bigger.** A larger colony gathers faster, which grows it faster again.

After the ten tutorial missions, the game opens into **free-build**: no cap, no ending,
keep growing the colony as big as you like. Gentle milestones (reach 50 ants, dig five
levels deep) pop a reward and unlock new room types, but they never block building. The
colony always keeps its own pace in real time, including while the kid is away.

**How it stays huge without slowing down (engine note):** the colony runs on counts and
rates under the hood, like a tycoon or idle game, so the ant number can climb into the
hundreds cheaply. The kid sees a lively sample of ants walking the tunnels, not every ant
drawn at once. This keeps it smooth at any size and keeps the world scripted and
deterministic, so the QA robot can still prove every mission and milestone is reachable.

## The journey: 10 first missions (the tutorial into free-build)

The missions sit on top of the colony as the journey. The first ten teach the builder loop
one step at a time, then hand off to free-build. Order is the unlock order, each opens
after the one before it is done:

1. **First Tunnel** - draw a path and watch a digger carve it.
2. **First Forage** - send a forager up to bring back food.
3. **Build a Nursery** - have a builder make the first nursery room.
4. **Hatch a Baby** - a nursery ant tends an egg until it hatches.
5. **Reach 10 Ants** - grow the colony to ten ants.
6. **Storage Room** - build a room to store extra food.
7. **Rainy Day** - a flood blocks a tunnel, clear it and keep going (first setback).
8. **Reach 25 Ants** - grow the colony to twenty-five ants.
9. **Resting Den** - build a den so tired ants can sleep and recover.
10. **Dig Deep** - dig far down to uncover a buried find.

Completing a mission awards coins to the shared wallet and pops a friendly celebration.
Missions never expire and never fail, a kid can take days over them.

## Real ant science (in the behavior and the buddy)

The colony behaves like a real ant colony in miniature: real ant jobs (diggers, foragers,
nursery workers, builders), eggs that need tending, foragers that carry food home, and
tunnels and chambers dug out of soil. The helper **buddy** shares short, true ant facts as
the kid plays (for example, that real ants talk with scent trails, or that a colony has one
egg-laying queen). The science lives in how the colony works and in the buddy's facts, not
in a quiz, so it stays a calm play experience.

## The look (Sunny Meadow)

Bright storybook nature. A sunny meadow surface with sandy dirt below, dotted with
mushrooms and bushes, and friendly big-eyed ants. The surface reuses the **Sling** props
and **Kenney** nature backgrounds already in the shared library. The ants and colony art
are generated later through the normal art pipeline and registered to the shared library.
Until that art lands, the manifest points at placeholder asset IDs and the engine falls
back to clean drawn shapes (`BR`), so the game always works.

## Difficulty (1 to 5)

Difficulty is a single **1 to 5** preset, never raw numbers. For Ant City it maps to two
things: **colony pace** (how fast ants dig, forage, and hatch) and **setback frequency**
(how often hunger, sleep, or rain slows things down). Lower is slower and calmer with fewer
setbacks, higher is livelier with more to manage. The engine translates the dial into its
own tuning internally, and every setting stays always-completable.

## Always-completable + QA

Because there is no lose state, "always-winnable" here means every mission can always be
finished: a scripted, deterministic world with no dead ends, generous timing, and setbacks
that only pause (never remove) progress. The QA hook is the standardized
**`window.BUILDABLE_GAME`** (with an `ANTCITY_GAME` alias). `qa-antcity.mjs` drives a
perfect-player bot through all ten missions headlessly and asserts each one reaches its
goal, plus the cartridge-contract checks (`pause` freezes and `resume` continues, art
resolves from manifest URLs, and there are no emojis anywhere).

## How it will be wired in

- **Vercel route** - `public/antcity-engine.html` and the `public/antcity/` folder each
  need an explicit route in `vercel.json`, before the `/(.*)` landing catch-all.
- **In-app Games picker** - an Ant City tile in `src/BuildableKids.jsx`, with its slug added
  to `GAME_SLUGS` so plays are counted.
- **Persistent save** - the colony and away-time growth are stored per kid (the one genuinely
  new system in this build, planned as its own session).

Multiplayer is off for v1. Every creation still saves, shares (a colony snapshot link), and
publishes through the shared mechanisms, per `CREATIONS.md`.
