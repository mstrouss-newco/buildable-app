// /api/admin-cleanup.js
// One-click database maintenance for the Admin Dashboard so the owner never has to
// run SQL by hand. Admin-token gated (same session-token auth as the other admin
// endpoints). Runs server-side using the Supabase service key.
//
// POST JSON: { task, action }
//   task:   'base64-layers' | 'qa-rows'
//   action: 'preview' (read-only, returns counts) | 'apply' (performs the cleanup)
//
// 'base64-layers': removes legacy data: rows from community_layers, but ONLY when a
//   clean-URL sibling (same subject+theme) exists, so no art is lost.
// 'qa-rows': removes diagtest / qaa95cb6 / QA-test leftovers from community_layers,
//   community_sprites and community_levels.

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

async function deleteRows(table, filter) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: headers({ Prefer: 'return=representation' }),
  });
  if (!r.ok) throw new Error(`delete ${table} -> ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data.length : 0;
}

async function base64Plan() {
  const rows = await selectRows('community_layers?select=id,subject,theme,image_url');
  const isB64 = (u) => typeof u === 'string' && u.startsWith('data:');
  const key = (r) => `${r.subject || ''}|||${r.theme || ''}`;
  const cleanKeys = new Set(rows.filter(r => !isB64(r.image_url)).map(key));
  const base64 = rows.filter(r => isB64(r.image_url));
  const removable = base64.filter(r => cleanKeys.has(key(r)));
  const orphans = base64.filter(r => !cleanKeys.has(key(r)));
  return { base64, removable, orphans };
}

const QA_FILTER_LS = 'or=(theme.eq.diagtest,theme.ilike.qaa95cb6*,subject.ilike.qa*test*)';
const QA_FILTER_LV = 'or=(theme.eq.diagtest,theme.ilike.qaa95cb6*)';

async function qaPlan() {
  const [layers, sprites, levels] = await Promise.all([
    selectRows(`community_layers?select=id&${QA_FILTER_LS}`),
    selectRows(`community_sprites?select=id&${QA_FILTER_LS}`),
    selectRows(`community_levels?select=id&${QA_FILTER_LV}`),
  ]);
  return {
    community_layers: layers.length,
    community_sprites: sprites.length,
    community_levels: levels.length,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
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
          orphanSample: plan.orphans.slice(0, 20).map(r => ({ id: r.id, subject: r.subject, theme: r.theme })),
          message: `${plan.removable.length} duplicate base64 rows can be safely removed; ${plan.orphans.length} have no clean copy and will be kept.`,
        });
      }
      if (action === 'apply') {
        let removed = 0;
        for (const r of plan.removable) {
          removed += await deleteRows('community_layers', `id=eq.${encodeURIComponent(r.id)}`);
        }
        return res.status(200).json({ task, action, removed, keptOrphans: plan.orphans.length,
          message: `Removed ${removed} duplicate base64 layer rows. Kept ${plan.orphans.length} with no clean copy.` });
      }
    }

    if (task === 'qa-rows') {
      const counts = await qaPlan();
      const total = counts.community_layers + counts.community_sprites + counts.community_levels;
      if (action === 'preview') {
        return res.status(200).json({ task, action, counts, total,
          message: `${total} QA/test rows found (${counts.community_layers} layers, ${counts.community_sprites} sprites, ${counts.community_levels} levels).` });
      }
      if (action === 'apply') {
        const removedLayers = await deleteRows('community_layers', QA_FILTER_LS);
        const removedSprites = await deleteRows('community_sprites', QA_FILTER_LS);
        const removedLevels = await deleteRows('community_levels', QA_FILTER_LV);
        const removed = removedLayers + removedSprites + removedLevels;
        return res.status(200).json({ task, action, removed,
          detail: { community_layers: removedLayers, community_sprites: removedSprites, community_levels: removedLevels },
          message: `Removed ${removed} QA/test rows.` });
      }
    }

    return res.status(400).json({ error: 'Unknown task or action', task, action });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
