# MULTIPLAYER.md — how two kids play together (the multiplayer playbook)

**Agents: read this before building any game where two kids play together** — on the
same device or across devices. It's the companion to `BUILDING-A-GAME.md`: that doc is
how a game *plays*; this is how two players *connect*.

The golden rule: **there are two transports, for two different needs.** Pick by how fast
the players need to see each other's actions.

| Transport | Use when | How | Reference |
|---|---|---|---|
| **Turn-based — poll a row** | Players take turns; nobody waits on milliseconds (chess, checkers, board/card games, word games) | One Supabase row holds the whole game state; a move PATCHes the row; the other device re-reads it every ~2s | Chess (live today) |
| **Real-time — Broadcast a channel** | A shared thing moves continuously (tennis, pong, air-hockey, co-op runners) | A Supabase **Realtime Broadcast** channel; peers send each other positions many times a second; nothing written to the DB per frame | Tennis (blueprint below) |

Same backend (**Supabase** — no new service), two different tools inside it. Don't use
polling for a moving ball (too slow), and don't Broadcast every chess move (needless).

---

## The rules that apply to ALL multiplayer (non-negotiable)

These come from how chess was built and from the kids'-product guardrails. Every new
multiplayer game must follow them, whichever transport it uses.

1. **Requires the parent-account lane.** Cross-device play needs both kids to be real
   `kid_profiles` rows under one `parent_accounts` row (Supabase Auth), so the *same kid
   identity* exists on both devices. **Device-only/guest kids cannot play cross-device** —
   they exist on one device only. (Same-device "pass-and-play" / two-player on one screen
   needs none of this — it's local.)
2. **Family-scoped security (RLS) is the model.** Every multiplayer table is row-level-
   security scoped so a family only ever sees/edits its OWN rows
   (`parent_id = auth.uid()`). Copy the `chess_matches` policy for any new table. Never
   open a multiplayer table wider than the family.
3. **No free-text chat between kids — ever.** Communication is **canned reactions only**
   ("Nice move!", "Good try!"), one per turn, no typing. This is a child-safety rule, not
   a UX preference. Any new multiplayer game keeps it.
4. **The engine stays network-agnostic.** The game (in its iframe) must NOT talk to
   Supabase. It only knows it's in an "online" mode, **emits its own actions** and
   **applies the opponent's actions** via `postMessage`. ALL networking lives in the
   React app. This is why the chess *engine* is reusable — keep that split for every game.
5. **Ship DB changes as idempotent `db/*.sql`** for the owner to run; never run
   destructive DB ops or handle secrets/keys (env vars by name only).

---

## Pattern A — Turn-based (the chess model, live today)

**Files:** `db/create-chess-matches.sql` · `src/lib/chessMatches.js` (REST layer) ·
`src/FamilyChess.jsx` (lobby + poll + bridge) · `public/buildable-chess.html` (engine,
`mode==='online'`).

**How it works:**
- **One row = one match.** `chess_matches` holds the **entire game state**: `board`
  (jsonb), `turn` (`'w'`/`'b'`), `last_move`, `status`, `winner`, `reaction`, plus
  `white_kid`/`black_kid`/`parent_id`/`world`. An `updated_at` trigger bumps on every
  change so the other device can tell something happened.
- **A move is a PATCH.** The mover's app writes the new board + flips `turn` via
  `patchMatch(id, {...})` (a PostgREST `PATCH /rest/v1/chess_matches?id=eq.<id>`).
- **The opponent polls.** `FamilyChess.jsx` runs `getMatch(id)` on a **2-second
  `setInterval`**; when the row changed, it `postMessage`s `chessOpponentMove`
  (`{state, lastMove}`) into the iframe, which animates the move. Reactions arrive the
  same way (`chessShowReaction`).
- **Lobby / matchmaking.** `createMatch(meKid, oppKid, world, state)` starts a game (the
  starter is White/"Purple", the invited sibling is Black/"Coral"). `listMyMatches(meKid)`
  lists this kid's active games. The Home tile polls whose-turn and shows a **"Your move!"**
  badge so a kid knows to come back.
- **Why "whole state in the row" works here:** turns are slow and rare, so re-sending the
  full board each move is cheap and means a dropped/late read self-heals on the next poll.

**Reuse it for any turn-based game** by copying the table + RLS, swapping `board` for your
game's state shape, and keeping the `postMessage` move/apply contract.

---

## Pattern B — Real-time (the tennis blueprint)

**Status: not built yet. Tennis is the first real-time game.** Supabase has the tool
(**Realtime Broadcast**); we just haven't used it. Design it like this.

**Core idea:** open a **Broadcast channel** named after the match (e.g.
`match:<matchId>`). Both devices join it and send each other small messages many times a
second. Broadcast trades guaranteed delivery for speed (~tens of ms), so the design has to
tolerate an occasional dropped message — which the rules below do by design.

**The five rules of the real-time design:**

1. **Send positions, not commands.** Broadcast *where* the paddle is
   (`{paddleY: 0.62}`), never *"paddle moved up"*. If one update is lost, the next one
   instantly corrects it — no drift, no stuck state. (State-sync, not event-sync.)
2. **One device is the boss of the ball (host authority).** The kid who *starts* the
   match simulates the ball physics and **broadcasts the ball's position + the score**.
   The other kid never simulates the ball — they just render where the host says it is.
   This is the rule that keeps both screens agreeing; without it the two balls slowly
   diverge and it looks glitchy. Each kid always broadcasts **only their own paddle**.
3. **Keep the ball kid-friendly slow.** A gentle/medium volley feels great at ~50ms; a
   frantic fast ball feels slippy. Tune ball speed down on purpose — it's a feature.
4. **Smooth the other player.** Lightly interpolate (lerp) the remote paddle and the ball
   toward each newly-received position instead of snapping, so small gaps between messages
   look smooth.
5. **Lean on Pattern A for everything that isn't the live volley.** Use a match **row**
   (a `tennis_matches` table, same family-RLS shape as chess) for the lobby (one kid
   starts → sibling joins), the agreed world/settings, and the final score. Broadcast is
   only for the fast-moving live state (ball + paddles). Slow, important facts still live
   in a row so they survive a disconnect.

**What it reuses from chess:** the account lane + family identity, the RLS-scoped match
row + lobby (`createMatch`/`listMyMatches`-style), the **canned-reactions-only** safety
rule, and the **engine-stays-network-agnostic** split (the tennis engine emits
`myPaddle`/applies `oppPaddle`+`ballState` via `postMessage`; a new
`src/lib/tennisMatch.js` + `src/FamilyTennis.jsx` own the Broadcast channel).

**What's honestly new/hard:** the Broadcast channel wiring, host-authoritative ball, and
reconnection (if the host drops, pause and offer a rematch rather than trying to hand off
authority mid-rally). Set expectations: this is "feels good for kids," not esports-perfect.

---

## Decision checklist for a new multiplayer game

1. **Same device or across devices?** Same device → local two-player (pass-and-play), no
   backend, no account lane. Across devices → continue.
2. **Turns or continuous motion?** Turns → **Pattern A** (poll a row). Continuous shared
   motion → **Pattern B** (Broadcast), plus a row for lobby/score.
3. **Make the table** (`<game>_matches`) with the **family-RLS policy copied from
   `chess_matches`**; ship it as an idempotent `db/create-<game>-matches.sql`.
4. **Keep the engine network-agnostic** — `postMessage` in/out only; put all Supabase code
   in a `src/lib/<game>Match.js` + a `src/Family<Game>.jsx`.
5. **Canned reactions only. No free text. Ever.**
6. **Gate on the account lane**, show a friendly "ask a grown-up to set up family play"
   state when it's not available, and confirm the Vercel account-lane env vars are live.
7. **QA across two real devices/sessions**, then log it in `SESSION-LOG.md` + the README.

---

## Current state vs target

- **Live:** turn-based family **chess** (poll model), gated on the parent-account lane
  (confirm `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set in Vercel — the README
  lists this as the last step to switch the lane fully on).
- **Not built:** any **real-time** multiplayer. Supabase Realtime/Broadcast is unused so
  far. **Tennis** is the planned first real-time game (blueprint above).
- **Target:** a small shared multiplayer layer so a new two-player game picks a transport
  and reuses one lobby + identity + safety stack — turn-based games share the chess row
  helpers; real-time games share a Broadcast helper. See `BUILDING-A-GAME.md` for where
  multiplayer fits in the overall build flow.
