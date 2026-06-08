// /api/admin-list-games.js
// Lists ALL games across the platform for the Admin Dashboard (QA + mechanics work).
// Unlike /api/list-games (device-scoped) and /api/list-published-games (public gallery),
// this returns every saved game AND every published game, with light metadata only
// (no heavy html column) so the admin can browse, QA, and open any game.
//
// Auth: same as admin-stats -- if ADMIN_API_TOKEN is set, an "x-admin-token" header
// must match. Otherwise responds read-only so dev works.

async function sbGet(url, key, path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const adminToken = process.env.ADMIN_API_TOKEN;
  if (adminToken && req.headers["x-admin-token"] !== adminToken) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(200).json({ configured: false, games: [] });

  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

  try {
    const [saved, published] = await Promise.all([
      // saved_games: hero/boss/world/goal/game_type/weapon + device + created_at
      sbGet(url, key,
        `saved_games?select=game_id,device_id,hero,boss,world,goal,game_type,weapon,created_at&order=created_at.desc&limit=${limit}`),
      // published_games: title/theme/mechanic/character/creator + play_count + preview
      sbGet(url, key,
        `published_games?select=game_id,title,theme,mechanic_slug,mechanic_name,character_name,creator_name,device_id,play_count,preview_image_url,moderation_status,created_at&order=created_at.desc&limit=${limit}`),
    ]);

    // Normalize into a single shape the admin table can render uniformly.
    const savedGames = (Array.isArray(saved) ? saved : []).map((g) => ({
      source: "saved",
      gameId: g.game_id,
      title: (g.hero && (g.hero.name || g.hero)) ? `${g.hero.name || g.hero}'s game` : "Untitled game",
      theme: g.world && (g.world.theme || g.world.name) ? (g.world.theme || g.world.name) : "",
      gameType: g.game_type || "platformer",
      mechanicName: g.goal && (g.goal.name || g.goal) ? (g.goal.name || g.goal) : "",
      characterName: g.hero && (g.hero.name || "") || "",
      creatorName: "",
      deviceId: g.device_id || "",
      playCount: null,
      previewImageUrl: (g.world && g.world.previewImage) || null,
      moderationStatus: "n/a",
      createdAt: g.created_at,
      playUrl: `/?remix=${g.game_id}`,
    }));

    const publishedGames = (Array.isArray(published) ? published : []).map((g) => ({
      source: "published",
      gameId: g.game_id,
      title: g.title || "Untitled game",
      theme: g.theme || "",
      gameType: "platformer",
      mechanicName: g.mechanic_name || g.mechanic_slug || "",
      characterName: g.character_name || "",
      creatorName: g.creator_name || "",
      deviceId: g.device_id || "",
      playCount: g.play_count == null ? 0 : g.play_count,
      previewImageUrl: g.preview_image_url || null,
      moderationStatus: g.moderation_status || "approved",
      createdAt: g.created_at,
      playUrl: `/play/${g.game_id}`,
    }));

    const games = [...publishedGames, ...savedGames].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

    return res.status(200).json({
      configured: true,
      total: games.length,
      counts: { published: publishedGames.length, saved: savedGames.length },
      games,
    });
  } catch (e) {
    console.error("admin-list-games error:", e);
    return res.status(200).json({ configured: true, error: e.message, games: [] });
  }
}
