// /api/admin-stats.js
// Aggregates REAL admin metrics from Supabase for the Admin Dashboard overview.
// Replaces the previously-hardcoded mock numbers.
//
// Auth: handled by ./_adminAuth.js. Accepts a short-lived signed session token
// (minted by /api/admin-session after admin-password login) OR the legacy raw
// ADMIN_API_TOKEN as x-admin-token. If ADMIN_API_TOKEN is unset, stays open for
// local/dev. No secrets are ever returned to the client.
//
// Cost: real per-call spend is read from the optional "usage_log" table (see
// db/create-usage-log.sql). Until that table has data, an ESTIMATE is computed
// from row counts x known unit costs so the dashboard is never blank.

import { isAdminAuthorized } from './_adminAuth.js';

const UNIT_COST = {
  // rough per-call USD, used only for the estimate fallback
  character: 0.04, // OpenAI image (gpt-image-1 / dall-e)
  level: 0.20, // 4 layers, mostly library now so usually ~0
  game: 0.00, // library-driven assembly; Claude text only
};

async function sb(url, key, path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
  });
  if (!r.ok) return { rows: [], count: 0 };
  const rows = await r.json().catch(() => []);
  // Supabase returns the exact count in the content-range header: "0-9/123"
  const cr = r.headers.get("content-range") || "";
  const count = cr.includes("/") ? parseInt(cr.split("/")[1], 10) || rows.length : rows.length;
  return { rows, count };
}

// Element inventory: how many layers + sprites we have, per theme, and how many
// are clean GitHub-raw URLs (asset-pack) vs heavy legacy base64 (data: URIs).
async function fetchInventory(url, key) {
  async function rows(table, cols) {
    const r = await fetch(`${url}/rest/v1/${table}?select=${cols}&limit=2000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return [];
    return r.json().catch(() => []);
  }
  const norm = (t) => {
    const s2 = String(t || "").toLowerCase();
    if (s2.includes("candy")) return "candy";
    return s2.trim();
  };
  const themeOf = (row) => {
    const tags = row.theme_tags || row.category || [];
    const arr = Array.isArray(tags) ? tags : [tags];
    return norm(arr[0]);
  };
  const isBase64 = (u) => typeof u === "string" && u.startsWith("data:");
  const [layers, sprites] = await Promise.all([
    rows("community_layers", "image_url,theme_tags,category"),
    rows("community_sprites", "image_url,theme_tags,subject"),
  ]);
  const byTheme = {};
  const bump = (theme, kind, base64) => {
    if (!byTheme[theme]) byTheme[theme] = { layers: 0, sprites: 0, layersBase64: 0, spritesBase64: 0 };
    byTheme[theme][kind] += 1;
    if (base64) byTheme[theme][kind === "layers" ? "layersBase64" : "spritesBase64"] += 1;
  };
  for (const l of layers) bump(themeOf(l), "layers", isBase64(l.image_url));
  for (const sp of sprites) bump(themeOf(sp), "sprites", isBase64(sp.image_url));
  const totals = {
    layers: layers.length,
    sprites: sprites.length,
    layersClean: layers.filter((l) => !isBase64(l.image_url)).length,
    spritesClean: sprites.filter((sp) => !isBase64(sp.image_url)).length,
  };
  return { totals, byTheme };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const dailyBudget = parseFloat(process.env.DAILY_BUDGET_USD || "50");

  // If the DB is not configured, return a safe empty shell (not mock data).
  if (!url || !key) {
    return res.status(200).json({
      configured: false,
      counts: { characters: 0, levels: 0, games: 0, publishedGames: 0, mechanics: 0 },
      cost: { today: 0, month: 0, source: "none", dailyBudget, budgetUsedPct: 0, monthlyEstimate: 0 },
      health: { db: "unconfigured", api: "operational" },
    });
  }

  try {
    // --- counts (HEAD-style count via range=0-0 keeps payloads tiny) ---
    const [chars, levels, games, published, mechanics] = await Promise.all([
      sb(url, key, "community_characters?select=asset_id&limit=1"),
      sb(url, key, "community_levels?select=id&limit=1"),
      sb(url, key, "saved_games?select=game_id&limit=1"),
      sb(url, key, "published_games?select=game_id&limit=1"),
      sb(url, key, "game_mechanics?select=slug&limit=1"),
    ]);

    const counts = {
      characters: chars.count,
      levels: levels.count,
      games: games.count,
      publishedGames: published.count,
      mechanics: mechanics.count,
    };

    // Library element inventory (layers + sprites per theme; clean vs base64).
    let inventory = null;
    try { inventory = await fetchInventory(url, key); } catch (e) { inventory = { error: e.message }; }

    // --- real spend from usage_log, if the table exists ---
    let today = 0, month = 0, source = "estimate";
    const byKind = {}; // kind -> { count, total } from usage_log
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date(); startOfMonth.setUTCDate(1); startOfMonth.setUTCHours(0, 0, 0, 0);

    const usageProbe = await fetch(
      `${url}/rest/v1/usage_log?select=cost_usd,created_at,kind&created_at=gte.${startOfMonth.toISOString()}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (usageProbe.ok) {
      const rows = await usageProbe.json().catch(() => []);
      if (Array.isArray(rows)) {
        source = "usage_log";
        for (const row of rows) {
          const c = parseFloat(row.cost_usd) || 0;
          month += c;
          if (new Date(row.created_at) >= startOfDay) today += c;
          const k = row.kind || "other";
          if (!byKind[k]) byKind[k] = { count: 0, total: 0 };
          byKind[k].count += 1;
          byKind[k].total += c;
        }
      }
    }

    // --- estimate fallback when usage_log is empty/missing ---
    if (source !== "usage_log") {
      month =
        counts.characters * UNIT_COST.character +
        counts.levels * UNIT_COST.level +
        counts.games * UNIT_COST.game;
      today = 0; // unknown without a log; shown as estimate
    }

    const budgetUsedPct = dailyBudget > 0 ? Math.round((today / dailyBudget) * 100) : 0;
    const monthlyEstimate = source === "usage_log" && today > 0 ? Math.round(today * 30 * 100) / 100 : Math.round(month * 100) / 100;

    // Per-type cost summary (count + total + average).
    const perType = Object.keys(byKind).map((k) => ({
      kind: k,
      count: byKind[k].count,
      total: Math.round(byKind[k].total * 10000) / 10000,
      avg: byKind[k].count ? Math.round((byKind[k].total / byKind[k].count) * 10000) / 10000 : 0,
    })).sort((a, b) => b.total - a.total);

    return res.status(200).json({
      configured: true,
      counts,
      perType,
      inventory,
      cost: {
        today: Math.round(today * 100) / 100,
        month: Math.round(month * 100) / 100,
        source,
        dailyBudget,
        budgetUsedPct,
        monthlyEstimate,
      },
      health: { db: "operational", api: "operational" },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("admin-stats error:", e);
    return res.status(200).json({
      configured: true,
      error: e.message,
      counts: { characters: 0, levels: 0, games: 0, publishedGames: 0, mechanics: 0 },
      cost: { today: 0, month: 0, source: "error", dailyBudget, budgetUsedPct: 0, monthlyEstimate: 0 },
      health: { db: "error", api: "operational" },
    });
  }
}
