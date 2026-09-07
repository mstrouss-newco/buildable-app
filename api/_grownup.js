// /api/_grownup.js — the grown-up gate, in ONE place.
//
//  Before CB-QA the grown-up studio checked the string "1111" in its own page
//  script, and 1111 is the same preview password a child types to get INTO the
//  studio. So the money, the sharing and the house rules were open to any child
//  who was already playing, and the code was readable in view-source. This file
//  makes the gate real:
//
//    - the code lives in the environment, never in a page;
//    - the check happens on the server, in constant time;
//    - a pass mints a short-lived signed token, and the writes that matter
//      (sharing a game, changing house rules, buying anything, printing a
//      poster) refuse to run without one.
//
//  A child can still read every byte the browser downloads and learn nothing.
//
//  ENVIRONMENT
//    COBUILD_GROWNUP_CODE   the code grown-ups type. Falls back to
//                           OWNER_PREVIEW_CODE, then "1025" for local work.
//                           It must NOT be the 1111 preview password.
import crypto from "crypto";

const RAW_CODE = String(process.env.COBUILD_GROWNUP_CODE || process.env.OWNER_PREVIEW_CODE || "1025").trim();
// Never let the kids' preview password double as the grown-up code, whatever
// the environment says.
export const GROWNUP_CODE = RAW_CODE === "1111" ? "1025" : RAW_CODE;

const SECRET = String(process.env.SUPABASE_SERVICE_KEY || process.env.STRIPE_SECRET_KEY || "bk-dev-secret") + "|grownup|" + GROWNUP_CODE;
const TTL_MS = 12 * 60 * 60 * 1000;   // a session at the kitchen table, not forever

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const sign = (exp) => crypto.createHmac("sha256", SECRET).update("bk-grownup." + exp).digest("hex").slice(0, 32);

// Constant time, and length-safe: compare digests, never the strings.
export function codeIsRight(entered) {
  try { return crypto.timingSafeEqual(sha(String(entered == null ? "" : entered).trim()), sha(GROWNUP_CODE)); }
  catch { return false; }
}

export function mintToken(now = Date.now()) {
  const exp = now + TTL_MS;
  return exp + "." + sign(exp);
}

export function tokenOk(token, now = Date.now()) {
  const parts = String(token == null ? "" : token).split(".");
  if (parts.length !== 2) return false;
  const exp = parseInt(parts[0], 10);
  if (!exp || exp < now) return false;
  try { return crypto.timingSafeEqual(sha(parts[1]), sha(sign(exp))); } catch { return false; }
}

// The one call every protected endpoint makes. The token may ride in a header
// (fetch) or in the body/query (a window.open that cannot set headers).
export function grownupOk(req, body) {
  const h = req && req.headers ? (req.headers["x-bk-grownup"] || req.headers["X-BK-Grownup"]) : null;
  if (tokenOk(h)) return true;
  if (body && tokenOk(body.grownupToken)) return true;
  try {
    const qs = String((req && req.url) || "").split("?")[1] || "";
    if (tokenOk(new URLSearchParams(qs).get("gt"))) return true;
  } catch {}
  return false;
}

// One wording for every refusal, so the pages can all react the same way.
export function refuseGrownup(res) {
  return res.status(403).json({ ok: false, needGrownup: true, error: "A grown-up code is needed for that." });
}
