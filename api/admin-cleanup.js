// /api/admin-cleanup.js
// One-click database maintenance for the Admin Dashboard so the owner never has to
// run SQL by hand. Admin-token gated. Runs server-side using the Supabase service key.
//
// POST JSON: { task, action }
//   task:   'base64-layers' | 'qa-rows'
//   action: 'preview' (read-only counts) | 'apply' (performs the cleanup)
//
// Schema note (from list-assets.js):
//   community_layers:  asset_id, layer_type, category, image_url, theme_tags (text[])
//   community_sprites: asset_id, subject, category, image_url, theme_tags (text[])
//   community_levels:  id, theme (and other cols); QA rows tagged via theme.
//   Display theme = theme_tags[0]. Rows are keyed/deleted by asset_id.

import { isAdminAuthorized } from './_adminAuth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function headers(extra) {
  return Object.assign({
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }, extra || {});
}

async function selectRows(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers: headers() });
  if (!r.ok) throw new Error(`select ${query} -> ${r.status}`);
  return r.json();
}

async function deleteWhere(table, col, value) {
  const filter = `${col}=eq.${encodeURIComponent(value)}`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: headers({ Prefer: 'return=representation' }),
  });
  if (!r.ok) throw new Error(`delete ${table} -> ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data.length : 0;
}

const isB64 = (u) => typeof u === 'string' && u.startsWith('data:');
const themeOf = (r) => (Array.isArray(r.theme_tags) && r.theme_tags[0]) || r.category || '';

async function base64Plan() {
  const rows = await selectRows('community_layers?select=asset_id,layer_type,category,image_url,theme_tags');
  const key = (r) => `${r.layer_type || r.category || ''}|||${themeOf(r)}`;
  const cleanKeys = new Set(rows.filter(r => !isB64(r.image_url)).map(key));
  const base64 = rows.filter(r => isB64(r.image_url));
  const removable = base64.filter(r => cleanKeys.has(key(r)));
  const orphans = base64.filter(r => !cleanKeys.has(key(r)));
  return { base64, removable, orphans };
}

const isQa = (r) => {
  const tags = Array.isArray(r.theme_tags) ? r.theme_tags : [];
  const theme = (r.theme || '').toLowerCase();
  const subject = (r.subject || '').toLowerCase();
  const tagHit = tags.some(t => {
    const s = String(t).toLowerCase();
    return s === 'diagtest' || s.startsWith('qaa95cb6');
  });
  const themeHit = theme === 'diagtest' || theme.startsWith('qaa95cb6');
  const subjHit = /^qa.*test/.test(subject);
  return tagHit || themeHit || subjHit;
};

async function qaPlan() {
  const [layers, sprites, levels] = await Promise.all([
    selectRows('community_layers?select=asset_id,category,theme_tags'),
    selectRows('community_sprites?select=asset_id,subject,category,theme_tags'),
    selectRows('community_levels?select=*'),
  ]);
  return {
    layers: layers.filter(isQa),
    sprites: sprites.filter(isQa),
    levels: levels.filter(isQa),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase env not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const task = String(body.task || '');
  const action = String(body.action || 'preview');

  try {
    if (task === 'base64-layers') {
      const plan = await base64Plan();
      if (action === 'preview') {
        return res.status(200).json({
          task, action,
          base64Total: plan.base64.length,
          removable: plan.removable.length,
          orphans: plan.orphans.length,
          message: `${plan.removable.length} duplicate base64 layer rows can be safely removed; ${plan.orphans.length} have no clean copy and will be kept.`,
        });
      }
      if (action === 'apply') {
        let removed = 0;
        for (const r of plan.removable) removed += await deleteWhere('community_layers', 'asset_id', r.asset_id);
        return res.status(200).json({ task, action, removed, keptOrphans: plan.orphans.length,
          message: `Removed ${removed} duplicate base64 layer rows. Kept ${plan.orphans.length} with no clean copy.` });
      }
    }

    if (task === 'qa-rows') {
      const plan = await qaPlan();
      const total = plan.layers.length + plan.sprites.length + plan.levels.length;
      if (action === 'preview') {
        return res.status(200).json({ task, action, total,
          counts: { community_layers: plan.layers.length, community_sprites: plan.sprites.length, community_levels: plan.levels.length },
          message: `${total} QA/test rows found (${plan.layers.length} layers, ${plan.sprites.length} sprites, ${plan.levels.length} levels).` });
      }
      if (action === 'apply') {
        let removed = 0;
        for (const r of plan.layers)  removed += await deleteWhere('community_layers',  'asset_id', r.asset_id);
        for (const r of plan.sprites) removed += await deleteWhere('community_sprites', 'asset_id', r.asset_id);
        for (const r of plan.levels)  removed += await deleteWhere('community_levels',  'id', r.id);
        return res.status(200).json({ task, action, removed, message: `Removed ${removed} QA/test rows.` });
      }
    }

    return res.status(400).json({ error: 'Unknown task or action', task, action });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
