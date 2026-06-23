# Buildable Kids — Session Log

_Working log kept in-repo so context survives a dropped browser session._
_Last updated by automation during the "zero-auth" session._

## Current directive (owner, this session)
1. **Work out of the browser** (no local/CLI assumptions).
2. **Zero auth** — we CANNOT create accounts yet. Remove the parent email/password
   login gate entirely. Kids should be able to use the app with no login.
3. Log everything; if a wall is hit, outline the challenge here so nothing is lost.

## Root cause of the "valid Bearer token" error (screenshot)
- "Add a kid profile" calls `createKidProfile()` in `src/lib/accounts.js`.
- That calls Supabase Auth `/auth/v1/user` + RLS-protected `kid_profiles` insert,
  which **require a signed-in parent JWT**.
- With no auth there is no JWT, so Supabase returns "This endpoint requires a valid
  Bearer token." The whole account layer assumes a real parent login exists.

## Architecture as found
- Frontend kid profiles/auth: `src/lib/accounts.js` (talks straight to Supabase
  Auth + REST with the anon key; RLS enforces per-family isolation).
- UI: `src/GrownUpScreen.jsx` — gate: parent sign-in/up → "Who's playing?" picker.
- Songs/games persistence: `/api/save-song.js`, `/api/save-game.js`, etc. These use
  the Supabase **service key** (bypasses RLS) and already support a **device lane**:
  they save/list by `device_id` when no kid is signed in, else by `kid_profile_id`.
- DB: `db/create-accounts.sql` (tables) + `db/create-accounts-rls.sql` (RLS).
  RLS policies are written around `auth.uid()` (the parent JWT).

## Chosen zero-auth design
Keep the **device lane** that already exists; drop accounts/auth entirely:
- Kid profiles become **device-local** (localStorage). Tap a tile = active kid.
  No Supabase Auth, no Bearer token. "Add profile" works instantly, offline.
- Songs/games keep saving **centrally** to Supabase via the existing service-key
  API endpoints, scoped by `device_id` (+ optional local `kidProfileId` passed
  through, harmless if null). Central repository is unchanged.
- `GrownUpScreen.jsx` loses the email/password form; shows the profile picker
  immediately. Renamed in spirit to a no-login "Who's playing?" screen.
- No SQL change is REQUIRED for this to work (service key bypasses RLS). The
  account tables can stay; they're just unused by the no-auth path.

## Constraints I am operating under (house rules)
- Commit to `main`; Vercel auto-deploys; verify each commit via GitHub.
- Do NOT click "Create a New Game" / "Publish my game" in the live UI.
- Do NOT create accounts, type passwords, or handle API keys/billing.
- Do NOT run SQL or change auth/keys in Supabase — surface owner steps here.
- GitHub web CodeMirror editor corrupts large existing files when typed into
  char-by-char (drops leading chars, injects phantom JSX close tags). Mitigation:
  set editor content via a single synthetic paste, never per-character typing.

## Task status
- [x] generate-song.js: ElevenLabs adapter + 90s cap + usage_log cost tracking
      (commit 1bca6cd) — deployed, owner confirmed working.
- [x] api/rename-song.js: own-song rename, 120-char cap (commit cdad64e) — deployed.
- [ ] Zero-auth accounts.js rewrite (this session).
- [ ] Zero-auth GrownUpScreen.jsx rewrite (this session).
- [ ] Rename-song UI button in MusicMaker.jsx (backend already live).

## Open items / things for the owner to check when awake
- (Optional) The Supabase account tables (parent_accounts, kid_profiles) are now
  unused by the app. Leave them; no action needed. Do NOT drop tables.
- If you later want kid profiles to sync across devices without accounts, that
  needs a deliberate design (anon device id table) — flagged, not done.
- Verify on buildablekids.com/demo that "Add profile" works with no login.

## Challenge log (append as issues arise)
- (none yet this session)
