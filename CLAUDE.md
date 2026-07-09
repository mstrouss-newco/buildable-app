# CLAUDE.md - Buildable Kids

Standing instructions for every Claude session in this repo. Read this before doing anything.

## What this is
Buildable Kids (buildablekids.com) is a kids gaming platform: simple games kids can customize, built as plain web pages. Mike (the owner) is non-technical. All recaps and questions to him must be in plain language, no jargon.

## Before any work
- Pull the latest from GitHub before touching any files. Always.
- For platform rebuild work, read `buildable-rebuild-roadmap.md` and `buildable-manifest-v2.md` in the repo root. If either is missing, stop and say so before proceeding.

## Session rules
- Do ONLY the task or session block you were given. Never start the next block, even if you finish early.
- Before writing code on architecture-level work, state your approach in a few sentences and wait for an ok.
- Commit in logical chunks with clear messages.
- Any session that touches a game ends by running that game's QA script (`qa-{game}.mjs`). If a game has no QA script, say so plainly. Never claim QA passed if it did not actually run.
- Update `SESSION-LOG.md` at the end: date, block ID, what shipped, what remains, anything flagged.
- Mike's planner (public/planner.html, live at /planner) is the source of truth for progress. Do NOT mark roadmap checkboxes done; Mike checks things off himself after testing on his devices.
- End every session with a plain-language recap: what was completed, what remains in the phase, and anything surprising, flagged honestly.

## Stack conventions
- Plain HTML/JS, no build step. Games are single files in `public/`. Shared systems are the `buildable-*.js` files.
- Hosting is Vercel (`vercel.json` holds routes and cache headers). Backend is Supabase.
- Converted games have `public/{game}/manifest.json` per the manifest-v2 spec. The shared loader `public/buildable-manifest.js` validates manifests and translates them for engines.
- Never hardcode art in a game: art is asset IDs resolved through the manifest. Difficulty is a 1-5 preset, never raw tuning numbers in a manifest.
- The audience is kids on iPads: instant feedback on every tap, no punishing lose states, generous touch targets, and images sized at 2x for retina screens.

## Priority games
Breaker, Survival, Sling, in that order. They are the reference set for all platform patterns.
