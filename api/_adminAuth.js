// api/_adminAuth.js
// Shared admin auth for the admin API endpoints.
//
// Two accepted credentials (checked in this order):
//   1. A short-lived signed SESSION token minted by /api/admin-session after a
//      correct admin-password login. The raw ADMIN_API_TOKEN never leaves the
//      server -- the browser only ever holds this expiring signed token.
//   2. (Legacy/back-compat) the raw ADMIN_API_TOKEN sent as x-admin-token.
//
// If ADMIN_API_TOKEN is not configured at all, the endpoints stay open so local
// dev keeps working (same behaviour as before this change).

import crypto from 'crypto';

// HMAC-sign a payload string with the server secret.
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Mint a session token: base64url(exp) + '.' + hmac(exp). Default TTL 30 min.
export function mintSessionToken(secret, ttlMs = 30 * 60 * 1000) {
  const exp = Date.now() + ttlMs;
  const payload = String(exp);
  const b = Buffer.from(payload).toString('base64url');
  return b + '.' + sign(payload, secret);
}

// Verify a session token: signature must match and it must not be expired.
function verifySessionToken(token, secret) {
  if (!token || token.indexOf('.') === -1) return false;
  const [b, sig] = token.split('.');
  let payload;
  try { payload = Buffer.from(b, 'base64url').toString('utf8'); } catch { return false; }
  const expected = sign(payload, secret);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const exp = parseInt(payload, 10);
  return Number.isFinite(exp) && Date.now() < exp;
}

// Returns true if the request is authorized to use an admin endpoint.
export function isAdminAuthorized(req) {
  const secret = process.env.ADMIN_API_TOKEN;
  if (!secret) return true; // not locked down (dev)
  const presented = req.headers['x-admin-token'] || '';
  if (presented && presented === secret) return true; // legacy raw token
  if (verifySessionToken(presented, secret)) return true; // signed session token
  return false;
}
