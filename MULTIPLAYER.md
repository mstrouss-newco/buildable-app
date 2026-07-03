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
4. **Smooth the other player — and DEAD-RECKON the ball, don't just lerp it.** For the
   remote **paddle**, a light lerp toward each new position is fine. For the **ball**, a
   plain lerp is NOT enough and *will* feel laggy: between the host's updates the ball has
   nothing to move toward, so it stalls, then jumps when the next packet lands. Instead the
   guest must **keep the ball moving on its own** between packets using the velocity the
   host sends. Every frame the guest: (a) advances a predicted target forward along the
   host's `vx/vy` (and bounces that target off the side walls so it stays in court),
   (b) renders the ball quickly toward that prediction, and (c) whenever a fresh `ball`
   packet arrives, snaps the target back to the host's authoritative position + velocity to
   correct drift. This is "dead reckoning / client-side prediction" — it's why the host
   broadcasts `vx,vy`, not just `x,y`. Tennis had exactly this bug (guest lerped toward a
   stale `x,y` and ignored `vx,vy`, so the ball felt delayed); the fix lives in
   `public/tennis.html` `update()` under the `role === "guest"` branch — copy that block as
   the template for any new real-time game. Also send state a bit faster than you think you
   need (~30–36/s) and keep the game's own paddle 100% local (never wait for the network to
   move the paddle the kid is touching).
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

---

## The real-time mechanic — how a game "uses" it (FROZEN CONTRACT)

This is the handshake that lets one chat build the game while another builds the pipes.
A game becomes multiplayer by **speaking these `postMessage` messages** — nothing more.
The game never touches Supabase, sockets, accounts, or the database. The reusable layer
(`src/lib/realtimeChannel.js` + `src/lib/rtMatch.js` + `src/FamilyRealtime.jsx`) does all
of that and launches the game inside an iframe.

**This contract is frozen.** Build the game against it; build the pipes against it; they
meet in the middle without either side waiting on the other.

### What the game must do

1. Run inside an iframe and read nothing about the network except these messages.
2. On load, when ready to play, post **`mp:ready`** to its parent.
3. Drive all networked motion by **broadcasting positions, not commands** (send "my
   paddle is at y=0.62", never "move up").
4. Respect **roles**: the `host` simulates and broadcasts the shared object (the ball);
   the `guest` never simulates it — it renders what the host sends. Both broadcast only
   their **own** paddle.

### App → Game (the pipes tell the game things)

| Message | Payload | Meaning |
|---|---|---|
| `mp:init`   | `{ role:"host"\|"guest", you:{kidId,name,color}, opp:{kidId,name,color}, world, settings }` | Both kids connected. Set up the match. `role` decides who owns the ball. |
| `mp:start`  | `{}` | Both sides are `mp:ready` — begin play now. |
| `mp:peer`   | `{ event, data }` | A live message from the opponent. e.g. `{event:"paddle", data:{y}}` or (from host only) `{event:"ball", data:{x,y,vx,vy,score}}`. Apply it. |
| `mp:reaction` | `{ text }` | Opponent sent a canned reaction — show a friendly bubble. |
| `mp:peerLeft` | `{}` | Opponent disconnected — pause and show "waiting…". |

### Game → App (the game asks the pipes to do things)

| Message | Payload | Meaning |
|---|---|---|
| `mp:ready`    | `{}` | Loaded and ready. The pipes wait for BOTH sides before sending `mp:start`. |
| `mp:send`     | `{ event, data }` | Broadcast a live message to the opponent. Send these many times a second (paddle every frame; ball every frame from the host only). |
| `mp:reaction` | `{ text }` | Send a canned reaction. `text` MUST be one of the allowed list (the pipes reject anything else — this is the no-free-text-chat rule, enforced). |
| `mp:result`   | `{ winner, score }` | Game over. The pipes write the final result to the match row and close the channel. |

### Conventions the game implements (not enforced by the pipes)

- **Paddle:** both sides each frame → `mp:send {event:"paddle", data:{y:0..1}}` (use a
  0–1 fraction so different screen sizes agree).
- **Ball:** host only, each frame → `mp:send {event:"ball", data:{x,y,vx,vy,score}}`
  (also 0–1 coords). Guest applies it via `mp:peer` and does NOT run ball physics.
- **Smooth the opponent:** lerp the remote **paddle** toward each new value; **dead-reckon the ball** — integrate it forward with the host's `vx,vy` between packets and reconcile to truth on each `ball` packet (a plain lerp toward stale `x,y` feels laggy). See Rule 4 + `public/tennis.html` guest branch.
- **Kid-friendly speed:** tune the ball slow enough to feel good at ~50 ms latency.

### The allowed canned reactions (no free text, ever)

`"Nice shot!"` · `"So close!"` · `"Good game!"` · `"Wow!"` · `"Let's go!"` · `"Haha!"`
The pipes validate `mp:reaction.text` against this list and silently drop anything else.

---

## Using the mechanic in a NEW game (the checklist)

To make any new game multiplayer, an agent (or a generation prompt that says "use the
real-time multiplayer mechanic") does ONLY this:

1. **Build the game to the contract above** — post `mp:ready`, broadcast positions via
   `mp:send`, apply `mp:peer`, honor `role`, end with `mp:result`. The game stays a
   normal network-agnostic `public/<game>.html` engine (see `BUILDING-A-GAME.md`).
2. **Launch it through the shared layer**, not a bare iframe:
   `<FamilyRealtime game={{ slug:"tennis", url:"/tennis.html", title:"Buildable Tennis" }} activeKid={...} />`.
   That component owns the lobby (one kid starts → sibling joins), the live channel, the
   role assignment, the reaction safety check, and the result write-back.
3. **Reuse the one match table.** `rt_matches` (family-RLS) already holds the lobby +
   settings + final score for ANY real-time game — distinguished by its `game` column.
   No new table per game.
4. **Register it** (optional, for the generator): the `game_mechanics` row
   `mp-realtime-broadcast` documents the mechanic so a prompt can request it by name. See
   `db/seed-multiplayer-mechanic.sql` and `MECHANICS.md`.

That's the whole opt-in: **build to the contract, launch through `FamilyRealtime`.** The
networking, security, lobby, and safety are inherited — not rebuilt.

### The reusable pieces (this chat owns these)

| File | Role |
|---|---|
| `src/lib/realtimeChannel.js` | Dependency-free Supabase Realtime Broadcast client (raw WebSocket, protocol v1.0.0). join / send / on / heartbeat / auto-reconnect. |
| `src/lib/rtMatch.js` | The `rt_matches` lobby over PostgREST (create / list / get / patch) — mirrors `chessMatches.js`. Derives the channel topic + the host/guest role. |
| `src/FamilyRealtime.jsx` | Generic glue: lobby UI → open channel → assign role → embed the game iframe → bridge the `mp:` contract ↔ the channel → enforce canned reactions → write the result. |
| `db/create-rt-matches.sql` | The family-RLS match table (run once in Supabase). |
| `db/seed-multiplayer-mechanic.sql` | Registers the mechanic in `game_mechanics`. |

> **Security note (v1):** the live channel is a public Broadcast topic named by the
> match's random UUID. The match UUID is only known to the family (the `rt_matches` row
> is RLS-locked to the family), so it's unguessable-in-practice. The honest upgrade later
> is Supabase **private channels + Realtime Authorization** (RLS on `realtime.messages`);
> `realtimeChannel.js` already passes the parent JWT as `access_token` so that switch is
> a config change, not a rewrite.

---

## Pattern C — Friends (cross-account, the reusable lobby)

**Status: NEW (branch `claude/friends-lobby`). Proven on chess first.** Patterns A & B
were **family-only** (two kids under ONE parent). Pattern C adds **approved friends on a
DIFFERENT account**, plus one shared **lobby** every game reuses. It sits on top of A/B —
a friend match is still a turn-based row (chess) or a Broadcast channel (tennis); what's
new is *who* can be on the other side and the *one* connect experience around it.

**The golden rule stays:** a game only supplies its board. Local play, the friends list,
online status, invites, and the waiting screen are all inherited from the lobby.

### The pieces (built ONCE, shared by all games)
| File | Role |
|---|---|
| `db/create-friends.sql` | The whole shared layer: family `friend_code`, `family_friends` (both-grown-ups approval), kid `last_seen` (presence), `game_invites`, and `friend_matches` (the ONE cross-account match table for every game, dual-parent RLS). Idempotent — **owner runs once.** |
| `api/friends.js` | The one service-role lobby brain (validates the caller's parent JWT): my code, add-by-code, pending/approve/decline, the friends list (siblings + approved friend kids, with online flags), and send/poll/accept/cancel invites. Emails the other grown-up (Resend) on a request and on an **offline** invite. |
| `src/lib/friends.js` | Client wrapper for `api/friends.js` **+ the presence heartbeat** (stamps `kid_profiles.last_seen` every ~30s while the app is open; online = seen < 90s). |
| `src/lib/friendMatches.js` | Turn-based poll over `friend_matches` (dual-parent RLS lets BOTH families read+patch) — the chess model on the shared table. |
| `src/GameLobby.jsx` | **The reusable lobby.** Mode select (Same device / Play with a friend) → friends list (online first, offline grayed but tappable, incoming invites, "Add a friend") → waiting+cancel → embeds the board and bridges moves. |
| `src/GrownUpFriends.jsx` | Grown-ups panel: show family code, add-by-code, approve/decline requests. The **safety gate**. Reached from Grown-ups → "Manage friends". |

### Safety model (non-negotiable, on top of the Pattern A/B rules)
- **No strangers, no open search.** Families connect only by a private **friend code** a
  grown-up shares with another grown-up.
- **BOTH grown-ups approve** before any kid can play (requester approves by requesting;
  the other approves in the grown-ups area). Nothing is playable while `status='pending'`.
- **Friends are family-to-family** and **shared across every game** — approve once, friends
  everywhere. The friends list a kid sees = their siblings + kids from approved friend
  families.
- Canned reactions only, engine stays network-agnostic — unchanged from A/B.

### Drop a NEW game into the lobby
Render `<GameLobby game={{ slug, title, url:"/<game>.html?online=1", transport:"turns" }}
activeKid={...} onHome={...} onSameDevice={...} onAddFriend={...} />`. Turn-based games work
today (chess). Real-time games (tennis) reuse the same lobby + `friend_matches` row for the
lobby/score and layer the Pattern B Broadcast channel on top — that bridge is the next step.

### Owner setup (one-time, in Vercel + Supabase)
1. Run `db/create-friends.sql` in the Supabase SQL editor.
2. Add env vars: `RESEND_API_KEY` and `RESEND_FROM` (a verified sender, e.g.
   `Buildable <hello@buildablekids.com>`), and optionally `APP_URL`. Email is skipped
   gracefully until `RESEND_API_KEY` is set — everything else works without it.

---

## Presence, offline turn-based play, and app-wide invite delivery (2026-07-02)

Three fixes so the invite/presence experience holds up on real devices:

- **Presence is app-wide.** `startPresence` / `stopPresence` now run from the top-level
  `BuildableKids` component for as long as a kid profile is active — anywhere in the app,
  not only inside `GameLobby`. So a kid making a song or playing a solo game still shows
  **online** to their friends. (`kid_profiles.last_seen` stamped every ~30s; online = seen
  in the last 90s.)
- **Turn-based games start immediately, even if the friend is offline.** For
  `transport:"turns"` (chess, checkers, tic-tac-toe), `api/friends.js`'s `invite` action
  creates the shared `friend_matches` row **now** and stores its id on the invite. The
  inviter sees **"Start game"** and drops straight into the board; the friend joins whenever
  they next open the app and plays on their turn (async, exactly like the "your move in chess"
  nudge). `accept` reuses that pre-created match. Only real-time games (tennis) still require
  both sides online — they keep the live connect/waiting handshake.
- **Invites reach the other kid anywhere.** The home hub (`HomeScreen`) polls the shared
  system for the active kid — `inboxInvites()` (pending `game_invites`) and
  `listActiveFriendMatches()` (turn-based `friend_matches` where it's this kid's move) — and
  shows **"X wants to play <game> → Join"** and **"Your move in <game> → Play"** as both a
  home-screen alert card and a Friends-pill entry with a badge. Tapping routes through a new
  `SCREEN_FRIEND_MATCH` + `gameSpecFor()` into `GameLobby` with an `autoJoin` prop (accept the
  invite / reopen the match, no friends-list detour).

No schema change — this uses columns that already exist (`game_invites.match_id`,
`friend_matches`). Nothing new for the owner to run.
