// /api/generate-game.js
// LIBRARY-DRIVEN VERSION.
// Generates a self-contained Phaser 3 game as HTML using Claude, assembled from
// the reusable libraries instead of generating new art per build:
//   - SPRITE library  -> community_sprites (game objects, by subject + theme)
//   - MECHANIC library -> game_mechanics  (reusable gameplay rules)
//   - LEVEL library    -> community_layers (backgrounds, via /api/generate-level)
// No DALL-E art is generated in the game-creation path. Sprites are pulled from
// the library (mix-and-match) and a mechanic is chosen from the mechanic library.
// If a needed sprite has no library asset, it is flagged under "gaps" in the
// response so the team can fill the library (Claude falls back to an emoji/shape
// for that one object so the game still runs).

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

const sbHeaders = (key) => ({ "apikey": key, "Authorization": "Bearer " + key });

// Write one row to usage_log per AI call so the Admin Dashboard shows real
// activity volume and spend over time. Matches db/create-usage-log.sql:
// (kind, cost_usd, model, device_id, meta). created_at defaults to now().
// Best-effort and non-blocking: never throws into the request path.
async function logUsage(supabaseUrl, supabaseKey, entry) {
  if (!supabaseUrl || !supabaseKey) return;
  try {
    await fetch(supabaseUrl + "/rest/v1/usage_log", {
      method: "POST",
      headers: { "apikey": supabaseKey, "Authorization": "Bearer " + supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: entry.kind,
        cost_usd: entry.costUsd || 0,
        model: entry.model || null,
        device_id: entry.deviceId || null,
        meta: entry.meta || null,
      }),
    });
  } catch (e) { /* best-effort: logging must never break generation */ }
}


// Call the Anthropic Messages API with automatic retry on rate-limit (429) and
// overload (529). max_tokens is sized to fit a complete game on Tier 2 while staying under the
// per-minute cap (raised from 7000 -> 13000 after the Tier 1 upgrade; 7000 was too
// small and truncated games mid-script). Honors the
// Retry-After header when present; otherwise uses exponential backoff.
const CLAUDE_MAX_TOKENS = 13000; // keep below the org's output tokens/min limit
async function fetchClaudeWithRetry(claudeKey, prompt, attempts) {
  const max = attempts || 3;
  let lastResp = null;
  for (let i = 0; i < max; i++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: CLAUDE_MAX_TOKENS, messages: [{ role: "user", content: prompt }] }),
    });
    lastResp = resp;
    // Only retry on transient rate-limit / overload responses.
    if (resp.status !== 429 && resp.status !== 529) return resp;
    if (i === max - 1) return resp; // out of attempts; let caller handle fallback
    // Respect Retry-After (seconds) if the API provides it, else backoff.
    const ra = parseFloat(resp.headers.get("retry-after"));
    const waitMs = (!isNaN(ra) && ra > 0) ? Math.min(ra * 1000, 15000) : (800 * Math.pow(2, i));
    console.error("generate-game: Claude " + resp.status + " (rate/overload); retry " + (i + 1) + "/" + (max - 1) + " in " + waitMs + "ms");
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return lastResp;
}

// Subjects we try to source from the sprite library for a game.
const WANTED_SUBJECTS = ["coin", "gem", "star", "heart", "chest", "spike", "cloud_platform", "key", "orb"];

// Pull reusable+approved sprites, optionally biased to a theme (case-insensitive).
// Mix-and-match: if the theme has no sprite for a subject, fall back to ANY theme.
async function fetchSprites(supabaseUrl, supabaseKey, theme) {
  if (!supabaseUrl || !supabaseKey) return { sprites: [], gaps: WANTED_SUBJECTS.slice() };
  try {
    const q = supabaseUrl + "/rest/v1/community_sprites?select=asset_id,subject,image_url,theme_tags"
      + "&reusable=eq.true&moderation_status=eq.approved&limit=1000";
    const r = await fetch(q, { headers: sbHeaders(supabaseKey) });
    if (!r.ok) return { sprites: [], gaps: WANTED_SUBJECTS.slice() };
    const rows = (await r.json()).filter((x) => x && x.image_url).sort((a, b) => (String(a.image_url || '').startsWith('data:') ? 1 : 0) - (String(b.image_url || '').startsWith('data:') ? 1 : 0));
    const want = normTheme(theme);
    const matchTheme = (x) => Array.isArray(x.theme_tags) && x.theme_tags.some((t) => normTheme(t) === want);

    const chosen = [];
    const gaps = [];
    for (const subject of WANTED_SUBJECTS) {
      const sameSubject = rows.filter((x) => x.subject === subject);
      const themed = sameSubject.filter(matchTheme);
      const pool = themed.length ? themed : sameSubject; // mix-and-match across themes
      if (pool.length) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        chosen.push({ subject, imageUrl: pick.image_url, assetId: pick.asset_id, theme: (pick.theme_tags || [])[0] || null });
      } else {
        gaps.push(subject);
      }
    }
    return { sprites: chosen, gaps };
  } catch (e) {
    return { sprites: [], gaps: WANTED_SUBJECTS.slice() };
  }
}

// Pick a mechanic from the MECHANIC library. Caller may request one by slug.
async function fetchMechanic(supabaseUrl, supabaseKey, preferredSlug) {
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const r = await fetch(
      supabaseUrl + "/rest/v1/game_mechanics?select=slug,name,description,rule,tags&enabled=eq.true&limit=100",
      { headers: sbHeaders(supabaseKey) }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    if (preferredSlug) {
      const found = rows.find((m) => m.slug === preferredSlug);
      if (found) return found;
    }
    return rows[Math.floor(Math.random() * rows.length)];
  } catch (e) { return null; }
}

// Normalize a theme to a canonical key so short UI labels ("candy") match the
// library's tags ("Candy kingdom"), case-insensitively, before any DALL-E fallback.
function normTheme(t) {
  const x = String(t || "").trim().toLowerCase();
  if (x.startsWith("candy")) return "candy";
  return x;
}

export default async function handler(req, res) {
  try {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { gameData } = req.body || {};
  if (!gameData) return res.status(400).json({ error: "gameData required" });

  // Strip base64 image blobs before forwarding to Claude (keep payload small).
  const safeGameData = {
    ...gameData,
    character: gameData.character ? { ...gameData.character, image: undefined } : gameData.character,
    level: gameData.level ? {
      ...gameData.level,
      image: undefined,
      previewImage: undefined,
      layers: gameData.level.layers ? gameData.level.layers.map((l) => ({ ...l, image: undefined })) : gameData.level.layers,
    } : gameData.level,
  };

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;

  const { character, level, playerName } = safeGameData;
  const charName = character?.name || "Hero";
  const charDesc = character?.description || "a brave hero";
  const levelName = level?.name || "Mystery World";
  const levelTheme = level?.theme || "forest";
  const levelDesc = level?.description || "a magical world";
  // Game type selector. Defaults to the side-scrolling platformer engine.
  // Path B: "breakout" reuses the same library sprites as bricks.
  // (Path A — a full multi-genre generator — is planned; see README.)
  const gameType = String(gameData?.gameType || "platformer").toLowerCase();

  // === Pull from the libraries (no new art generated here) ===
  const [{ sprites, gaps }, mechanic] = await Promise.all([
    fetchSprites(supabaseUrl, supabaseKey, levelTheme),
    fetchMechanic(supabaseUrl, supabaseKey, gameData?.mechanicSlug),
  ]);

  if (!claudeKey) {
    return res.status(200).json({ html: fallbackGame(safeGameData), source: "library", mechanic, spriteGaps: gaps });
  }

  const spriteLines = sprites.length
    ? sprites.map((s) => "- " + s.subject + ": use image " + s.imageUrl).join("\n")
    : "(no library sprites available — use simple emoji/shapes)";

  const mechanicBlock = mechanic
    ? "Chosen mechanic from the MECHANIC library: \"" + mechanic.name + "\" — " + mechanic.description
      + "\nRule parameters (JSON): " + JSON.stringify(mechanic.rule)
    : "Mechanic: run-and-jump platformer with a clear win/lose condition.";

  const platformerPrompt = [
    "Create a complete, self-contained HTML file containing a polished Phaser 3 game for a child named " + (playerName || "a kid") + ".",
    "",
    "Game details:",
    "- Character (the hero the player controls): " + charName + " (" + charDesc + ")",
    "- World/theme: " + levelName + " (theme: " + levelTheme + " - " + levelDesc + ")",
    "- Player name to display: " + (playerName || "Player"),
    "",
    "=== GAMEPLAY: use the chosen mechanic from the MECHANIC library ===",
    mechanicBlock,
    "Build the game around this mechanic. Keep a clear win/lose condition and an anti-soft-lock failsafe.",
    "",
    "=== ART: use the SPRITE library (do NOT invent or request new art) ===",
    "Load these object sprites as images (transparent PNGs) via this.load.image(key, url) in preload and use them for the matching game objects:",
    spriteLines,
    "For any object with no library image, fall back to a simple emoji or Phaser shape so the game still runs.",
    "Use the background layer images from the level data if provided; otherwise use theme colors for the " + levelTheme + " theme.",
    "",
    "=== VISUAL COHERENCE RULES (HARD CONSTRAINTS — follow exactly) ===",
    "The canvas is 800 wide by 400 tall. Keep the game readable and uncluttered:",
    "- GROUND: a single flat ground line at y=360. The hero and all ground enemies stand ON this line (their bottom edge at y=360). Do not scatter platforms randomly.",
    "- HERO: draw/scale the hero to about 40 wide by 52 tall. Spawn the hero at x=100, resting on the ground (y so its feet are at y=360). Never spawn the hero off-screen or overlapping the HUD.",
    "- WORLD & CAMERA (HARD CONSTRAINT - the player must travel THROUGH the world, not run in place): build a level WIDER than the screen (worldWidth about 3200px). Call this.physics.world.setBounds(0,0,worldWidth,400) and this.cameras.main.setBounds(0,0,worldWidth,400), give the hero setCollideWorldBounds(true), and this.cameras.main.startFollow(hero, true, 0.1, 0.1). Spread the ground, collectibles, enemies and the goal across the FULL worldWidth so moving right reveals new ground. The world must NOT stop scrolling when the hero reaches the right edge of the canvas - the camera follows the hero across the whole level. Backgrounds use setScrollFactor for parallax. Reaching the right end / the goal is the win for distance-style mechanics.",
    "- COLLECTIBLES (coin/gem/star/heart/orb/key): scale every collectible sprite to 32x32 pixels via setDisplaySize(32,32). Space them at least 90px apart horizontally. Float them between y=200 and y=320.",
    "- ENEMIES/HAZARDS (spike/chest etc.): scale to about 40x40 via setDisplaySize. Never overlap the hero spawn (keep the first 250px clear).",
    "- BACKGROUND DECOR (cloud_platform, clouds): keep in the top third (y < 160) and behind gameplay (low depth). Do not let decor overlap the hero, score, or collectibles.",
    "- HUD-SAFE ZONE: reserve the top-left 220x40 region for the score and the area above the hero for its name label. No sprites in those zones.",
    "- SCALING: every loaded library image MUST get an explicit setDisplaySize(...) so source PNGs of any resolution render at the sizes above. Never display a raw, unscaled imported image.",
    "- DEPTH ORDER (back to front): background decor < ground < collectibles/enemies < hero < HUD/labels. Set .setDepth() accordingly so nothing important is hidden.",
    "",
    "=== MECHANICS POLISH (tested patterns) ===",
    "- LIVES (HARD CONSTRAINT): the player has 3 lives. Show them as hearts in the top-right HUD. Touching a hazard/enemy removes ONE life, briefly makes the hero flash/invulnerable for ~1s, and respawns control (do NOT end the game on the first hit). Only when lives reach 0 is it Game Over. This applies to runner/distance mechanics too - a runner is NOT one-hit; it has 3 lives.",
    "Enemies with named movement patterns (linear, patrol, zigzag, swoop dive-bomb). Auto-aim/auto-fire helper so young kids don't have to aim. Collectibles where some are power-ups charging a meter. Difficulty ramp (count/speed up, harder patterns later). Gentle game-over + Play Again.",
    "Put all skinnable values (hero look, theme colors, sprite keys/urls, enemy defs, the mechanic params) in a clearly-marked CONFIG object near the top, separate from the engine.",
    "",
    "Technical requirements:",
    "1. Load Phaser 3 from CDN: https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js",
    "1b. CRISP PIXEL-ART RENDERING (HARD CONSTRAINT - sprites currently look blurry/over-smoothed): in the Phaser game config set render: { pixelArt: true, antialias: false, roundPixels: true } (and type: Phaser.AUTO). Scale every loaded library PNG to the target size with whole-number-friendly setDisplaySize/ setScale so pixel art stays sharp, and never upscale a small sprite blurrily. Set the canvas CSS image-rendering to pixelated.",
    "2. Draw the hero and enemies with Phaser graphics or emoji; load the object sprites listed above from their URLs.",
    "3. CONTROLS (HARD CONSTRAINTS - implement ALL of these):",
    "   a) MOVEMENT: LEFT/RIGHT arrow keys AND A/D keys move the hero left and right. In update(), if left is down set hero velocityX to -moveSpeed (about 220), if right is down set it to +moveSpeed, otherwise set velocityX to 0. The hero MUST be able to walk both directions - do not make it a fixed-position auto-runner.",
    "   b) JUMP: SPACE or UP arrow or W jumps; allow a double-jump (max 2 jumps before touching the ground). Reset the jump count when the hero is on the floor (body.blocked.down or body.onFloor()).",
    "   c) MOBILE/TOUCH (REQUIRED - the game must be fully playable on an iPad/iPhone with NO keyboard): draw three large on-screen buttons fixed to the camera using setScrollFactor(0) and a high depth - a LEFT button (bottom-left), a RIGHT button (next to it), and a JUMP button (bottom-right). Make each button at least 64x64 px with a visible semi-transparent background and an arrow/label. Use setInteractive() and pointerdown/pointerup (and pointerout) to set move flags (moveLeft/moveRight) true on press and false on release, and trigger a jump on the JUMP button pointerdown. These flags drive the SAME movement code as the keyboard so touch and keyboard behave identically. Also support a tap anywhere on the play area to jump.",
    "   d) Use a fixed canvas size with Phaser Scale.FIT and autoCenter so the game scales to fit phone screens, and set the page/body to touch-action:none so touches do not scroll the page.",
    "4. WIN/LOSE (HARD CONSTRAINTS - do NOT auto-win):",
    "   a) The player WINS only by satisfying the chosen mechanic's real goal (e.g. collecting ALL required stars/coins, or reaching the goal). Track collected vs required and only show the win screen when collected >= required. NEVER show a win when the score is 0 or no objectives were collected.",
    "   b) If there is a countdown timer and it reaches 0 BEFORE the goal is met, that is a LOSE (show Game Over + Play Again), not a win. Time running out must never trigger a win.",
    "   c) Touching a hazard/spike (per the mechanic) is a LOSE. Always provide a Play Again button on both win and lose so the game can never soft-lock.",
    "   d) HELPER REACTION (required): the moment you show the WIN screen, call window.parent.postMessage({source:\"buildable\",kind:\"win\"},\"*\") exactly once; the moment you show the LOSE/Game Over screen, call window.parent.postMessage({source:\"buildable\",kind:\"lose\"},\"*\") exactly once. Do not call these more than once per game-over.",
    "5. Show score top-left and " + charName + " as a label above the hero.",
    "6. Canvas 800x400, scaled to fit the screen (Scale.FIT + autoCenter), dark body background. Auto-start, no splash screen.",
    "7. Colorful, readable, fun for ages 5-12.",
    "8. Return ONLY the HTML starting with <!DOCTYPE html>. No markdown, no code fences.",
  ].join("\n");

  // === BREAKOUT prompt (Path B). Brick-breaker that reuses the library sprites as bricks. ===
  const breakoutPrompt = [
    "Create a complete, self-contained HTML file containing a polished Phaser 3 BREAKOUT / brick-breaker game for a child named " + (playerName || "a kid") + ".",
    "",
    "Game details:",
    "- Theme: " + levelName + " (theme: " + levelTheme + " - " + levelDesc + ")",
    "- The paddle hero is themed after: " + charName + " (" + charDesc + ")",
    "- Player name to display: " + (playerName || "Player"),
    "",
    "=== GAMEPLAY: BREAKOUT ===",
    "A paddle at the bottom bounces a ball up into a grid of bricks. Clear all the bricks to WIN. If the ball falls below the paddle you lose a life; out of lives = game over with a Play Again button. Start with 3 lives and 1 ball.",
    "Build a clear win (all bricks cleared) and lose (no lives left) condition, plus an anti-soft-lock failsafe: if the ball ever gets stuck moving nearly horizontally, nudge its angle so it can always reach bricks.",
    "When the player clears all bricks (WIN), call window.parent.postMessage({source:\"buildable\",kind:\"win\"},\"*\") once; when lives run out (Game Over), call window.parent.postMessage({source:\"buildable\",kind:\"lose\"},\"*\") once.",
    mechanic ? ("Optional mechanic hint from the library: " + mechanic.name + " — " + mechanic.description) : "If helpful, make some bricks worth more points or drop a simple power-up (wider paddle / extra ball).",
    "",
    "=== ART: use the SPRITE library as BRICKS (do NOT invent new art) ===",
    "Load these sprites as images via this.load.image(key, url) in preload and use them as the BRICKS, arranged in a neat grid (mix the subjects across rows for variety):",
    spriteLines,
    "For any object with no library image, fall back to a solid colored rectangle brick so the game still runs.",
    "Use a theme-appropriate background color for the " + levelTheme + " theme (or a background layer image if provided).",
    "",
    "=== VISUAL COHERENCE RULES (HARD CONSTRAINTS — follow exactly) ===",
    "The canvas is 800 wide by 400 tall. Keep it readable and uncluttered:",
    "- BRICK GRID: arrange bricks in the top half only (y from 60 to 200). Use a regular grid, e.g. about 8 columns by 4 rows, each brick scaled with setDisplaySize to about 72x28 with small gaps. Do not let bricks overlap.",
    "- PADDLE: a rounded rectangle about 110 wide by 18 tall near the bottom (y around 370), drawn with Phaser graphics in the theme color. It moves only left/right.",
    "- BALL: a circle about 14px diameter. Launch it upward from the paddle at the start.",
    "- HUD-SAFE ZONE: reserve the top-left 220x40 for the score/lives text. No bricks in that zone.",
    "- SCALING: every loaded library image MUST get an explicit setDisplaySize(...) so source PNGs of any resolution render at the brick size. Never display a raw, unscaled image.",
    "- DEPTH ORDER (back to front): background < bricks < ball < paddle < HUD.",
    "",
    "=== POLISH ===",
    "Smooth ball bounce off walls, paddle, and bricks. Ball angle depends on where it hits the paddle (hit left side = bounce left). Brief flash/scale when a brick is destroyed. Gentle difficulty: speed the ball up slightly each time several bricks are cleared. Put all skinnable values (theme colors, sprite keys/urls, grid size, paddle size, ball speed, lives) in a clearly-marked CONFIG object near the top, separate from the engine.",
    "",
    "Technical requirements:",
    "1. Load Phaser 3 from CDN: https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js",
    "2. Use arcade physics with NO gravity (set gravity y to 0). The ball uses velocity + world bounds + collider bounce.",
    "3. Controls: LEFT/RIGHT arrow keys move the paddle; mouse/touch X also moves the paddle (mobile). Click/tap or SPACE launches the ball if it is waiting.",
    "4. Show score and lives top-left and " + charName + " as a small label on the paddle.",
    "5. Canvas 800x400, centered, dark body background. Auto-start, no splash screen.",
    "6. Colorful, readable, fun for ages 5-12.",
    "7. Return ONLY the HTML starting with <!DOCTYPE html>. No markdown, no code fences.",
  ].join("\n");

  // Select the prompt for the requested game type (defaults to platformer).
  const prompt = gameType === "breakout" ? breakoutPrompt : platformerPrompt;


  try {
    const response = await fetchClaudeWithRetry(claudeKey, prompt);

    if (!response.ok) {
      console.error("Claude API error:", response.status, await response.text());
      return res.status(200).json({ html: fallbackGame(safeGameData), source: "library", mechanic, spriteGaps: gaps });
    }

    const data = await response.json();
    let html = data.content?.[0]?.text || "";
    var fence = String.fromCharCode(96).repeat(3);
    if (html.slice(0,3) === fence) { html = html.replace(/^[a-zA-Z]*\n?/, ""); }
    html = html.split(fence).join("").trim();

    // If Claude hit the output-token limit the HTML is truncated mid-code
    // (unbalanced brackets, no Phaser.Game call). Serving that gives a blank
    // canvas, so treat a non-"end_turn" stop as a generation failure.
    const stopReason = data.stop_reason || (data.content && "end_turn");
    if (stopReason === "max_tokens") {
      console.error("generate-game: Claude response truncated (max_tokens). Using fallback.");
      return res.status(200).json({ html: fallbackGame(safeGameData), source: "library", mechanic, spriteGaps: gaps, fallbackReason: "truncated" });
    }

    // Validate the generated game before serving it. A truncated or malformed
    // game (unbalanced (){}, or missing the Phaser bootstrap) renders blank.
    const validation = validateGameHtml(html);
    if (!validation.ok) {
      console.error("generate-game: generated HTML failed validation (" + validation.reason + "). Using fallback.");
      return res.status(200).json({ html: fallbackGame(safeGameData), source: "library", mechanic, spriteGaps: gaps, fallbackReason: validation.reason });
    }

    // Record this build in usage_log (library builds cost $0 but we log the
    // activity so the Admin Dashboard shows real volume over time).
    logUsage(supabaseUrl, supabaseKey, {
      kind: "game",
      costUsd: 0,
      model: "claude-sonnet-4-6",
      deviceId: (gameData && gameData.deviceId) || null,
      meta: { gameType, theme: levelTheme, spritesUsed: sprites.map((s) => s.subject), spriteGaps: gaps, mechanic: mechanic ? mechanic.slug : null },
    });
    return res.status(200).json({
      html,
      source: "library",
      gameType,
      mechanic: mechanic ? { slug: mechanic.slug, name: mechanic.name } : null,
      spritesUsed: sprites.map((s) => s.subject),
      spriteGaps: gaps,          // <- flagged missing-library sprites
      costUsd: 0,                // no image generation in the build path
    });
  } catch (e) {
    console.error("generate-game error:", e);
    return res.status(200).json({ html: fallbackGame(safeGameData), source: "library", mechanic, spriteGaps: gaps });
  }
  } catch (fatalErr) {
    // Catch-all: any unexpected error must still return a playable game,
    // never an HTTP 500 (which renders a blank canvas for the kid).
    console.error("generate-game fatal error:", fatalErr);
    var safeFb = (req && req.body && req.body.gameData) ? req.body.gameData : {};
    return res.status(200).json({ html: fallbackGame(safeFb), source: "fallback", fallbackReason: "fatal-error" });
  }
}

// Validate a generated Phaser game before serving it. Catches the common
// failure mode where Claude's output was truncated mid-script: unbalanced
// brackets and/or a missing Phaser bootstrap, which renders a blank canvas.
function validateGameHtml(html) {
  if (!html || typeof html !== "string") return { ok: false, reason: "empty" };
  if (!html.includes("<!DOCTYPE") && !html.includes("<html")) return { ok: false, reason: "not-html" };
  if (!/<\/html\s*>/i.test(html)) return { ok: false, reason: "no-closing-html" };
  // Must actually bootstrap a Phaser game.
  if (!html.includes("new Phaser.Game") && !html.includes("Phaser.Game(")) return { ok: false, reason: "no-phaser-game" };
  // Extract the script bodies and check bracket balance (ignores strings only
  // loosely, but a truncated file is almost always badly unbalanced).
  const scripts = (html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [])
    .map((s) => s.replace(/<script\b[^>]*>/i, "").replace(/<\/script>/i, ""))
    .join("\n");
  const code = scripts || html;
  const bal = (open, close) => (code.split(open).length - 1) === (code.split(close).length - 1);
  if (!bal("(", ")")) return { ok: false, reason: "unbalanced-parens" };
  if (!bal("{", "}")) return { ok: false, reason: "unbalanced-braces" };
  if (!bal("[", "]")) return { ok: false, reason: "unbalanced-brackets" };
  return { ok: true, reason: "ok" };
}

// Built-in fallback game when Claude is unavailable.
function fallbackGame(gameData) {
  const charName = (gameData && gameData.character && gameData.character.name) || "Hero";
  const levelName = (gameData && gameData.level && gameData.level.name) || "Mystery World";
  const playerName = (gameData && gameData.playerName) || "Player";
  const theme = (gameData && gameData.level && gameData.level.theme) || "forest";

  const bgColors = { forest: "#1a4a1a", castle: "#2a2a4a", underwater: "#0a3a5a", space: "#050510", desert: "#8a6020", volcano: "#5a1a05", "candy kingdom": "#3a1a3a" };
  const platformColors = { forest: 0x228b22, castle: 0x888888, underwater: 0x006994, space: 0x4b0082, desert: 0xc2955d, volcano: 0x8b0000, "candy kingdom": 0xff69b4 };
  const bg = bgColors[theme] || "#1a1a2e";
  const platColor = platformColors[theme] || 0x228b22;

  const cfg = JSON.stringify({ charName: charName, levelName: levelName, playerName: playerName, bg: bg, platColor: platColor });

  const game = [
    "const CFG=" + cfg + ";",
    "const W=800,H=400,WORLD_W=3200,GROUND_Y=360;",
    "class Main extends Phaser.Scene{",
    "  constructor(){super('Main');}",
    "  create(){",
    "    this.physics.world.setBounds(0,0,WORLD_W,H);",
    "    this.cameras.main.setBounds(0,0,WORLD_W,H);",
    "    this.lives=3;this.score=0;this.over=false;this.invuln=0;this.jumps=0;",
    "    this.add.rectangle(W/2,H/2,W,H,Phaser.Display.Color.HexStringToColor(CFG.bg).color).setScrollFactor(0).setDepth(-10);",
    "    for(var i=0;i<24;i++){this.add.circle(i*180+40,70+(i%3)*40,14,0xffffff,0.08).setScrollFactor(0.3).setDepth(-9);}",
    "    this.ground=this.physics.add.staticGroup();",
    "    for(var gx=0;gx<WORLD_W;gx+=80){var g=this.add.rectangle(gx+40,GROUND_Y+20,80,40,CFG.platColor);this.physics.add.existing(g,true);this.ground.add(g);}",
    "    this.hero=this.add.rectangle(100,GROUND_Y-26,40,52,0xffcc00);this.physics.add.existing(this.hero);this.hero.body.setCollideWorldBounds(true);this.physics.add.collider(this.hero,this.ground);",
    "    this.nameTag=this.add.text(100,GROUND_Y-58,CFG.charName,{fontSize:'13px',fill:'#fff',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(40);",
    "    this.cameras.main.startFollow(this.hero,true,0.12,0.12);",
    "    this.coins=this.physics.add.group({allowGravity:false});this.spikes=this.physics.add.staticGroup();",
    "    for(var cx=420;cx<WORLD_W-200;cx+=260){var c=this.add.circle(cx,GROUND_Y-90-((Math.round(cx/260))%2)*60,12,0xffd700);this.physics.add.existing(c);c.body.setAllowGravity(false);this.coins.add(c);}",
    "    for(var sx=600;sx<WORLD_W-300;sx+=540){var s=this.add.triangle(sx,GROUND_Y-14,0,28,14,0,28,28,0xcc3355);this.physics.add.existing(s,true);this.spikes.add(s);}",
    "    this.physics.add.overlap(this.hero,this.coins,this.grab,null,this);",
    "    this.physics.add.overlap(this.hero,this.spikes,this.hit,null,this);",
    "    this.goal=this.add.rectangle(WORLD_W-80,GROUND_Y-50,18,80,0x00e676);this.physics.add.existing(this.goal,true);this.physics.add.overlap(this.hero,this.goal,this.win,null,this);",
    "    this.scoreText=this.add.text(12,12,'Score: 0',{fontSize:'20px',fill:'#fff',stroke:'#000',strokeThickness:4}).setScrollFactor(0).setDepth(50);",
    "    this.hearts=[];for(var hi=0;hi<3;hi++){this.hearts.push(this.add.text(W-90+hi*26,12,'\u2665',{fontSize:'22px',fill:'#ff4d6d',stroke:'#000',strokeThickness:3}).setScrollFactor(0).setDepth(50));}",
    "    this.cursors=this.input.keyboard.createCursorKeys();this.keys=this.input.keyboard.addKeys('A,D,W,SPACE');",
    "    this.input.keyboard.on('keydown-SPACE',this.jump,this);this.input.keyboard.on('keydown-UP',this.jump,this);this.input.keyboard.on('keydown-W',this.jump,this);",
    "    this.moveLeft=false;this.moveRight=false;this.makeButtons();",
    "    this.input.on('pointerdown',function(p){if(p.y<H-90)this.jump();},this);",
    "  }",
    "  makeButtons(){",
    "    var self=this;var mk=function(x,label){var b=self.add.rectangle(x,H-44,72,72,0x000000,0.35).setScrollFactor(0).setDepth(60).setInteractive();self.add.text(x,H-44,label,{fontSize:'30px',fill:'#fff'}).setOrigin(0.5).setScrollFactor(0).setDepth(61);return b;};",
    "    var l=mk(50,'\u25C0'),r=mk(132,'\u25B6'),j=mk(W-50,'\u25B2');",
    "    l.on('pointerdown',function(){self.moveLeft=true;});l.on('pointerup',function(){self.moveLeft=false;});l.on('pointerout',function(){self.moveLeft=false;});",
    "    r.on('pointerdown',function(){self.moveRight=true;});r.on('pointerup',function(){self.moveRight=false;});r.on('pointerout',function(){self.moveRight=false;});",
    "    j.on('pointerdown',function(){self.jump();});",
    "  }",
    "  jump(){if(this.over)return;if(this.hero.body.blocked.down){this.jumps=0;}if(this.jumps<2){this.hero.body.setVelocityY(-560);this.jumps++;}}",
    "  grab(h,c){c.destroy();this.score+=10;this.scoreText.setText('Score: '+this.score);}",
    "  hit(h,s){if(this.invuln>0||this.over)return;this.invuln=1000;this.lives--;if(this.hearts[this.lives])this.hearts[this.lives].setFill('#444');this.hero.setFillStyle(0xff6666);this.hero.body.setVelocity(-120,-200);if(this.lives<=0){this.end(false);}}",
    "  win(){if(!this.over)this.end(true);}",
    "  end(won){this.over=true;this.physics.pause();var cx=this.cameras.main.midPoint.x;var msg=won?('You Win, '+CFG.playerName+'!'):'Game Over';this.add.text(cx,150,msg,{fontSize:'34px',fill:won?'#ffd700':'#ff5555',stroke:'#000',strokeThickness:5}).setOrigin(0.5).setDepth(70);var self=this;var pa=this.add.text(cx,210,'\u25B6 Play Again',{fontSize:'24px',fill:'#fff',backgroundColor:'#2a9d8f',padding:{x:16,y:8}}).setOrigin(0.5).setDepth(70).setInteractive();pa.on('pointerdown',function(){self.scene.restart();});}",
    "  update(t,dt){if(this.over)return;if(this.invuln>0){this.invuln-=dt;if(this.invuln<=0)this.hero.setFillStyle(0xffcc00);}",
    "    var spd=220,vx=0;if(this.cursors.left.isDown||this.keys.A.isDown||this.moveLeft)vx=-spd;else if(this.cursors.right.isDown||this.keys.D.isDown||this.moveRight)vx=spd;this.hero.body.setVelocityX(vx);",
    "    this.nameTag.x=this.hero.x;this.nameTag.y=this.hero.y-32;",
    "    if(this.hero.y>H+80)this.hit(this.hero,null);}",
    "}",
    "new Phaser.Game({type:Phaser.AUTO,width:W,height:H,backgroundColor:CFG.bg,render:{pixelArt:true,antialias:false,roundPixels:true},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},physics:{default:'arcade',arcade:{gravity:{y:900},debug:false}},scene:Main,parent:document.body});",
  ].join("");

  return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + levelName + " - " + charName + "</title>"
    + "<style>*{margin:0;padding:0;box-sizing:border-box}html,body{background:" + bg + ";height:100%;overflow:hidden;touch-action:none}canvas{image-rendering:pixelated;image-rendering:crisp-edges}</style></head><body>"
    + "<script src=\"https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js\"><\/script><script>" + game + "<\/script></body></html>";
}
