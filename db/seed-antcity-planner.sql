-- Ant City: Session 1 handoff cards for the "Update Planner" store.
-- These are the remaining Ant City build blocks after this foundation session
-- (spec + manifest stub). Each row is one future session to hand to Claude.
-- Additive + idempotent: safe to run repeatedly (skips a card that already exists
-- by the same target + description). Requires db/create-planner-tasks.sql first.
-- Run once in the Supabase SQL editor. No secrets, no destructive ops.

-- Card 1: engine + QA harness (built together, same session, per the playbook)
insert into planner_tasks (kind, target, description)
select 'game', 'Ant City',
  'Build the Ant City engine as a cartridge (public/antcity-engine.html) reading public/antcity/manifest.json through buildable-manifest.js. Side-view colony: kid draws tunnel paths and digger ants excavate over time (kid never digs directly); drop food and water; assign ants across 4 jobs (diggers, foragers, nursery, builders). Scripted and deterministic, NO physics engine. Setbacks pause but never punish (hungry/sleepy ants stop, rain floods block a tunnel until fixed); no lose state. Data-driven GAME_CONFIG; difficulty 1-5 maps to colony pace + setback frequency. Use shared libs BR/BA/BM/Feel + shared HUD + gamenav bridge; honor pause/resume; announce coins, report win/levelup. Write qa-antcity.mjs IN THE SAME SESSION (model qa-breaker.mjs): a perfect-player bot completes all 10 missions headlessly, plus contract checks (pause freezes, art resolves from manifest URLs, no emojis). Add the vercel.json routes and the in-app picker tile + GAME_SLUGS. Additive only.'
where not exists (
  select 1 from planner_tasks where target = 'Ant City'
    and description like 'Build the Ant City engine as a cartridge%'
);

-- Card 2: colony save + away-time growth (THE RISKY NEW BUILD - flag it)
insert into planner_tasks (kind, target, description)
select 'game', 'Ant City',
  'RISKY NEW BUILD (flag to Mike): the persistent colony save + away-time growth system. The colony must never reset and must keep growing in real time while the kid is away. Store colony state per kid (idempotent db/create-antcity-colony.sql for Mike to run; best-effort, never blocks play) and compute growth from elapsed real time on load (a deterministic catch-up tick so digging, foraging, and hatching advance for the time away), capped sensibly so a long absence is a happy welcome-back, not chaos. Keep it deterministic so qa-antcity.mjs can prove missions still complete. Snapshot must be shareable per CREATIONS.md (save + private link + moderated publish). This is the one genuinely new subsystem; scope and de-risk it on its own before wiring deeper.'
where not exists (
  select 1 from planner_tasks where target = 'Ant City'
    and description like 'RISKY NEW BUILD%'
);

-- Card 3: art generation + Kenney sandy-dirt curation (Sunny Meadow look)
insert into planner_tasks (kind, target, description)
select 'game', 'Ant City',
  'Art for Ant City in the Sunny Meadow direction: bright storybook nature, sandy dirt below a sunny meadow with mushrooms and bushes, friendly big-eyed ants. Generate the ants + colony art (queen/worker ants, eggs, nursery/storage/den rooms, buried find) through the normal art pipeline and register to the shared library (community_* tables, kind + theme tags). Reuse the Sling props and Kenney nature backgrounds already in the library for the surface. Curate sandy dirt / soil tiles from the Kenney shelf (game-assets/): pick only the tiles used, serve from public/game-assets/, and register them (theme forest/desert, license note) so they load like any other asset. Fill the manifest placeholder IDs (antcity/ant/*, antcity/soil/*, antcity/surface/*, badges) with the real registered IDs. Keep the BR drawn fallback for every slot. Additive; never re-path a live asset.'
where not exists (
  select 1 from planner_tasks where target = 'Ant City'
    and description like 'Art for Ant City%'
);

-- Card 4: created sounds + one meadow music loop (grow the shared library)
insert into planner_tasks (kind, target, description)
select 'game', 'Ant City',
  'Create bespoke Ant City sounds + music (a new engine is the moment to grow the shared library). Add named prompts to SOUNDS in api/sfx.js for: digging, marching feet, hatch chime, munching, and rain. EVERY one-shot must be at least 0.5 seconds or /api/sfx returns 503 and the sound is silently gone in game (author them >= 0.5s). Add one Sunny Meadow music loop to api/library-music.js (MUSIC map) so every game can reuse it; wire it in the engine via BA.setMusic + BA.playMusic. Register everything so it appears in /api/list-audio. Real created audio only; the BA synth stays a silent fallback. Verify each with fetch(/api/sfx?s=<key>) returning 200 audio/mpeg.'
where not exists (
  select 1 from planner_tasks where target = 'Ant City'
    and description like 'Create bespoke Ant City sounds%'
);
