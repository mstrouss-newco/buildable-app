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
    const rows = (await r.json()).filter((x) => x && x.image_url);
    const want = String(theme || "").toLowerCase();
    const matchTheme = (x) => Array.isArray(x.theme_tags) && x.theme_tags.some((t) => String(t).toLowerCase() === want);

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
    "- COLLECTIBLES (coin/gem/star/heart/orb/key): scale every collectible sprite to 32x32 pixels via setDisplaySize(32,32). Space them at least 90px apart horizontally. Float them between y=200 and y=320.",
    "- ENEMIES/HAZARDS (spike/chest etc.): scale to about 40x40 via setDisplaySize. Never overlap the hero spawn (keep the first 250px clear).",
    "- BACKGROUND DECOR (cloud_platform, clouds): keep in the top third (y < 160) and behind gameplay (low depth). Do not let decor overlap the hero, score, or collectibles.",
    "- HUD-SAFE ZONE: reserve the top-left 220x40 region for the score and the area above the hero for its name label. No sprites in those zones.",
    "- SCALING: every loaded library image MUST get an explicit setDisplaySize(...) so source PNGs of any resolution render at the sizes above. Never display a raw, unscaled imported image.",
    "- DEPTH ORDER (back to front): background decor < ground < collectibles/enemies < hero < HUD/labels. Set .setDepth() accordingly so nothing important is hidden.",
    "",
    "=== MECHANICS POLISH (tested patterns) ===",
    "Enemies with named movement patterns (linear, patrol, zigzag, swoop dive-bomb). Auto-aim/auto-fire helper so young kids don't have to aim. Collectibles where some are power-ups charging a meter. Difficulty ramp (count/speed up, harder patterns later). Gentle game-over + Play Again.",
    "Put all skinnable values (hero look, theme colors, sprite keys/urls, enemy defs, the mechanic params) in a clearly-marked CONFIG object near the top, separate from the engine.",
    "",
    "Technical requirements:",
    "1. Load Phaser 3 from CDN: https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js",
    "2. Draw the hero and enemies with Phaser graphics or emoji; load the object sprites listed above from their URLs.",
    "3. Controls: SPACE or UP to jump, double-jump allowed. Touch/click also jumps (mobile).",
    "4. Show score top-left and " + charName + " as a label above the hero.",
    "5. Canvas 800x400, centered, dark body background. Auto-start, no splash screen.",
    "6. Colorful, readable, fun for ages 5-12.",
    "7. Return ONLY the HTML starting with <!DOCTYPE html>. No markdown, no code fences.",
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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 16000, messages: [{ role: "user", content: prompt }] }),
    });

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
  const charName = gameData?.character?.name || "Hero";
  const levelName = gameData?.level?.name || "Mystery World";
  const playerName = gameData?.playerName || "Player";
  const theme = gameData?.level?.theme || "forest";

  const bgColors = { forest: "#1a4a1a", castle: "#2a2a4a", underwater: "#0a3a5a", space: "#050510", desert: "#8a6020", volcano: "#5a1a05", "candy kingdom": "#8a2060", candy: "#8a2060" };
  const platformColors = { forest: 0x228b22, castle: 0x888888, underwater: 0x006994, space: 0x4b0082, desert: 0xc2955d, volcano: 0x8b0000, "candy kingdom": 0xff69b4, candy: 0xff69b4 };
  const bg = bgColors[theme] || "#1a4a1a";
  const platColor = platformColors[theme] || 0x228b22;
  const platHex = platColor.toString(16).padStart(6, "0");

  return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>" + levelName + " - " + charName + " Runner</title>"
    + "<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;gap:10px}#info{color:rgba(255,255,255,0.7);font-size:13px;letter-spacing:1px}</style></head><body>"
    + "<div id=\"info\">" + playerName + " &middot; " + levelName + "</div>"
    + "<script src=\"https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js\"><\/script><script>"
    + "const W=800,H=400;class Main extends Phaser.Scene{constructor(){super('Main')}create(){this.alive=true;this.jumpCount=0;this.scrollSpeed=3;this.dist=0;this.add.rectangle(W/2,H/2,W,H,0x" + bg.slice(1) + ");"
    + "this.plats=this.physics.add.staticGroup();const g=this.make.graphics({x:0,y:0,add:false});g.fillStyle(0x" + platHex + ");g.fillRect(0,0,W+100,40);g.generateTexture('plat',W+100,40);g.destroy();const p=this.plats.create(W/2+50,H-20,'plat');p.refreshBody();"
    + "const h=this.make.graphics({x:0,y:0,add:false});h.fillStyle(0xff6b6b);h.fillRoundedRect(5,20,30,30,6);h.fillStyle(0xffd93d);h.fillCircle(20,12,12);h.generateTexture('hero',40,52);h.destroy();this.hero=this.physics.add.sprite(100,H-100,'hero');this.physics.add.collider(this.hero,this.plats);"
    + "this.nameTag=this.add.text(0,0,'" + charName + "',{fontSize:'13px',fill:'#fff',stroke:'#000',strokeThickness:3}).setOrigin(0.5,1);"
    + "this.hud=this.add.text(16,16,'Score: 0',{fontSize:'20px',fill:'#fff',stroke:'#000',strokeThickness:3});this.keys=this.input.keyboard.addKeys({up:Phaser.Input.Keyboard.KeyCodes.UP,space:Phaser.Input.Keyboard.KeyCodes.SPACE});this.cursors=this.input.keyboard.createCursorKeys();this.input.on('pointerdown',()=>this.tryJump())}"
    + "tryJump(){if(this.jumpCount<2){this.hero.setVelocityY(-570);this.jumpCount++}}"
    + "update(){if(!this.alive)return;this.dist+=this.scrollSpeed*0.02;this.hud.setText('Score: '+Math.floor(this.dist));if(this.hero.body.blocked.down)this.jumpCount=0;const j=Phaser.Input.Keyboard.JustDown(this.cursors.up)||Phaser.Input.Keyboard.JustDown(this.keys.space)||Phaser.Input.Keyboard.JustDown(this.keys.up);if(j)this.tryJump();this.nameTag.setPosition(this.hero.x,this.hero.y-26)}}"
    + "new Phaser.Game({type:Phaser.AUTO,width:W,height:H,backgroundColor:'" + bg + "',physics:{default:'arcade',arcade:{gravity:{y:820},debug:false}},scene:Main,parent:document.body});"
    + "<\/script></body></html>";
}
