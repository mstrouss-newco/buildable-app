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
  the working ants, the guide and the swarm.
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
