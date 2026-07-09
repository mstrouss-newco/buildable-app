# Buildable Kids — GAME-FEEL.md

**What this is:** the one place that says how every Buildable game is supposed to *feel* in a kid's hands. Feel is platform law, not a per-game choice. A kid moving from Breaker to Sling to a studio should feel the same reassuring, generous, celebratory response to everything they do. Games do not each invent their own juice — they call the shared **Feel Kit** (`public/buildable-feel.js`) and get it for free.

Companion docs: `buildable-manifest-v2.md` (section 5b, Feel presets), `HUD-AND-NAV-RULES.md` (the bar + nav), `GAME-LOOK.md` (how art is drawn).

---

## The six feel laws

1. **Instant tap feedback.** Every tap, press, or launch answers *now* — a sound and a light buzz on the same frame the finger lands, before anything else happens. A kid never wonders "did that work?" Nothing waits on a network call to feel responsive.

2. **One shared win celebration.** Winning looks and sounds the same everywhere: a floating win card (never a half-shaded, greyed-out screen), a burst of confetti, a happy chime, and a success buzz. The words on the card change per game; the feeling never does.

3. **Coins land with a burst.** Earning coins is always a gold sparkle plus a rising coin chime plus a light buzz. Coins are a reward the body feels, not a number that quietly ticks up.

4. **No punishing fail states.** Losing is gentle. A soft amber nudge, a light shake, a kind sound — never a harsh red flash, never a heavy slam, never the words "GAME OVER" shouted at a child. Fail states invite another try; they do not scold. The card says "Try again," and the path back to playing is one tap.

5. **Generous, kid-sized hitboxes.** Anything a kid aims at is bigger than it looks. Taps, catches, and target hits use padded hit areas so small fingers and imprecise aim still succeed. When in doubt, forgive. The Feel Kit exposes a standard slop value so every game forgives by the same amount.

6. **One shared sound palette.** Every game draws from the same named library of crafted sounds (`select`, `win`, `lose`, `coin`, `hit`, `explode`, `levelup`, `pop`, `sparkle`, `powerup`, …). A "coin" sounds like a Buildable coin in every game. Games trigger names, never raw tones. Real crafted audio only; the built-in synth is a dev/offline fallback, never the shipped sound.

---

## The Feel Kit (buildable-feel.js)

One facade, `window.BuildableFeel` (short alias `Feel`), that wraps the pieces that used to be called separately:

- **Sound** — the shared audio library (`buildable-audio.js`). The Kit configures the shared sound palette once, so a game never wires its own sound map.
- **Effects** — particle bursts, screen shake, screen flash, floating pop text (`buildable-mechanics.js`) and the reusable draw library (`buildable-renders.js`).
- **Celebration card** — the one floating win/try-again card (`buildable-wincard.js`).
- **Haptics** — light / success / warning vibration patterns (where the device supports them).

A game calls the Kit instead of reimplementing juice. The Kit degrades gracefully: if a piece isn't loaded (headless QA, a cold offline page), every call is a safe no-op.

### What a game calls

```
Feel.configure({ accent, feel, sfxMap });   // once, from the manifest
Feel.setFx(fx);                             // hand the Kit the game's fx object

Feel.tap();                                 // instant: click sound + light buzz
Feel.hit(x, y, color);                      // small impact: soft particle + tick
Feel.coinBurst(x, y, amount);               // gold sparkle + coin chime + buzz
Feel.explode(x, y, color, { pop });         // big impact, scaled by celebration preset
Feel.miss();                                // gentle fail nudge (never punishing)
Feel.celebrate(W, H);                       // fire the win: confetti + chime + success buzz
Feel.winCard(ctx, W, H, lines);             // draw the shared floating card each frame
Feel.sfx(name, opt);                        // trigger any palette sound by name

Feel.update(fx, dt);  Feel.draw(ctx, fx);   // one fx pipeline (delegates to effects)
Feel.hitSlop();                             // standard generous hit padding (px)
Feel.paceScale();                           // 0.9 / 1.0 / 1.12 from the pace preset
```

Celebration scaling is automatic: `celebration: "big"` adds confetti and a bright flash; `celebration: "calm"` keeps it gentle. Haptics fire only when `haptics: "on"` and the device supports vibration. Games never read these presets themselves; they call the Kit and the Kit obeys the manifest.

---

## Feel presets (the only feel knobs)

Feel is not remixable by kids and not hand-tuned per level. The manifest exposes exactly three constrained presets (see `buildable-manifest-v2.md` §5b):

- `pace` — `chill` / `normal` / `zippy` (a global tempo hint; the Kit turns it into a speed multiplier)
- `celebration` — `calm` / `big` (how loud the win moment is)
- `haptics` — `on` / `off`

Everything else — which sounds, how big a burst, the shape of the win card, the forgiveness of a hitbox — is identical across all games and lives in the Kit, not the manifest. Kids customize *art and audio assets* through their loadout; they can never change how the game feels.

---

## Rules for adding a new game

1. Load the Kit (`buildable-feel.js`) and the win card (`buildable-wincard.js`); call `Feel.configure` when the manifest loads.
2. Route every sound through `Feel.sfx(name)` using palette names — never invent a tone.
3. Fire `Feel.tap()` on the first input of any action; `Feel.coinBurst` on every coin; `Feel.celebrate` + `Feel.winCard` on every win; `Feel.miss` on every fail.
4. Never draw your own greyed-out win overlay, your own "GAME OVER," or your own bespoke confetti. Use the Kit.
5. Pad your hit tests by `Feel.hitSlop()`.

If a game needs something the Kit can't do, the fix is to add it to the Kit so every game gets it — not to reimplement juice inside one game.
