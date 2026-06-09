// api/admin-session.js
// Exchanges a correct admin password for a short-lived signed session token.
// POST { password } -> { token, exp }  (200) on success.
//
// The real ADMIN_API_TOKEN secret is used ONLY server-side to sign the token;
// it is never sent to the browser. The browser stores the returned signed
// token and replays it as the x-admin-token header on admin API calls.
//
// Password source: ADMIN_PASSWORD env var, falling back to the same default
// the client uses so existing logins keep working until an env value is set.

import { mintSessionToken } from './_adminAuth.js';

const DEFAULT_PASSWORD = 'buildable123';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Parse body (Vercel usually parses JSON, but be defensive).
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const password = (body && body.password) || '';

  const expected = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  if (password !== expected) {
    return res.status(401).json({ error: 'invalid password' });
  }

  const secret = process.env.ADMIN_API_TOKEN;
  if (!secret) {
    // Endpoints are not locked down; no token needed. Tell the client so.
    return res.status(200).json({ token: '', exp: 0, locked: false });
  }

  const ttlMs = 30 * 60 * 1000; // 30 minutes, matches the client session window
  const token = mintSessionToken(secret, ttlMs);
  return res.status(200).json({ token, exp: Date.now() + ttlMs, locked: true });
}
