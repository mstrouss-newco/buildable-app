# 👉 START HERE NEXT — Buildable Kids (paused June 23 2026)

Quick orientation for the next session. Read this, then see README.md's
"Notes for AI tools / agents" section and the dated session log for full detail.

## ✅ Just finished: Parent/Kid accounts are LIVE and fully working
- Supabase project `mhxxkujnawncahztifvg`: tables (`parent_accounts`, `kid_profiles`,
  `saved_songs`) + `kid_profile_id` columns + family Row Level Security all applied.
- Supabase Auth Email sign-in is ON (email confirmation is also ON — new parent signups
  must click a verification email before first sign-in; toggle off in Supabase Auth if it
  slows testing).
- Vercel env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public anon key) are
  set and deployed.
- The "Grown-ups" sign-in screen renders on the live demo (buildablekids.com/demo) with
  no console errors. Nothing left to do on this feature.
- Bonus fix along the way: `saved_songs` table never existed, so song-saving had been
  silently failing — now created. Repo SQL files + `src/lib/accounts.js` were reconciled
  to the live schema (uses `parent_accounts.id` = auth.uid(); no `auth_user_id` column).

## ▶️ NEXT TASK: ElevenLabs audio generation
Queued and waiting ONLY on the OWNER adding an ElevenLabs account + API key to Vercel env.
Once that key exists:
1. Wire `api/generate-audio.js` — server-side call to ElevenLabs using the owner's key
   (never expose the key to the browser; keep it a non-`VITE_` env var like the other
   service keys).
2. Wire the playback path in `src/MusicMaker.jsx` to use the generated audio URL.
3. Mind data minimization: store song recipes, not raw voice/audio; no child voice
   capture without explicit consent.

**Agent must NOT** create the ElevenLabs account or handle the API key — surface that to
the owner first and have them add it themselves.

## ⚠️ Before any PUBLIC launch (not a testing blocker)
Verifiable parental consent before storing a child's identifiable data; data
minimization; deletion support; a real privacy policy + legal review. Owner owns these.

## House rules (unchanged)
- Commit to `main`; Vercel auto-deploys. Verify each change via the GitHub API.
- Never click "Create a New Game" / "Publish my game" in the live UI.
- Never create accounts, enter passwords, or handle API keys / billing — surface to owner.
- Never run SQL or change auth/keys inside Supabase yourself — guide the owner's clicks.
- NOTE: README.md is ~96KB; the GitHub web editor virtualizes it, so full-file
  clear-and-paste is unreliable (cmd+a won't select the whole doc and pastes append).
  Prefer small targeted files like this one, or the GitHub API, for large edits.
