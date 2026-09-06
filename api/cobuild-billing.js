// /api/cobuild-billing.js — WHAT A FAMILY IS ON, AND WHAT THEY HAVE USED (CB4).
//
// Money lives ONLY on the grown-up side. Nothing in this file is ever shown to a
// child, and no page a child sees calls it.
//
//   GET/POST { op:"plan", familyId }        -> { ok, plan:{...} }   what they are on
//   POST { op:"check", familyId }           -> { ok, allowed, left, why }  before a build
//   POST { op:"count", familyId, kind }     -> { ok, used, left }   after a build
//   POST { op:"checkout", familyId, plan }  -> { ok, url }          Stripe Checkout
//   POST { op:"addon", familyId }           -> { ok, url }          three more games, $5
//   POST { op:"portal", familyId }          -> { ok, url }          manage or cancel
//   POST (Stripe webhook, signed)           -> { ok }               keeps the row honest
//
// THE METER, in one place so it cannot drift:
//   a NEW game counts one, a REMIX counts one, an EDIT NEVER COUNTS, and a layer
//   three build (CB5) counts two. Edits being free is the promise the grown-up
//   page makes in those words, so it is enforced here rather than remembered.
//
// SECRETS: this file holds none. It reads STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// and the three price ids BY NAME from the environment, which the owner sets in
// Vercel. With no key set every money door answers { ok:false, reason:"not_open" }
// and the meter lets everyone through, which is exactly right while /studio is
// still behind the preview gate.
import crypto from "crypto";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const SITE = process.env.APP_URL || "https://buildablekids.com";

// The two plans and the add-on, exactly as the live fake-door test priced them.
// The numbers here are what the grown-up page SAYS; the price ids are what Stripe
// CHARGES, and they live in the environment because they belong to the account.
export const PLANS = {
  cobuild: { label: "Cobuild", monthly: 10, games: 3, price: () => process.env.STRIPE_PRICE_COBUILD || "" },
  premium: { label: "Premium", monthly: 20, games: 10, price: () => process.env.STRIPE_PRICE_PREMIUM || "" },
};
export const ADDON = { label: "Three more games", once: 5, games: 3, price: () => process.env.STRIPE_PRICE_ADDON || "" };
// What one build costs the meter. An edit is free and always will be.
export const COST = { new: 1, remix: 1, edit: 0, layer3: 2 };
const PERIOD_DAYS = 30;

const str = (v, n) => (v == null ? "" : String(v)).trim().slice(0, n || 120);
const enc = encodeURIComponent;
function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
function rawBody(req) {
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => r(s)); req.on("error", () => r("")); });
}
async function sb(pathAndQuery, init) { return fetch(`${URL_}/rest/v1/${pathAndQuery}`, { ...(init || {}), headers: { ...H, ...((init && init.headers) || {}) } }); }
async function rows(pathAndQuery) { const r = await sb(pathAndQuery); if (!r.ok) return null; const j = await r.json().catch(() => null); return Array.isArray(j) ? j : null; }

// Is the real door open yet? While cobuild_live is off, /studio is behind the
// preview gate, nobody has paid, and so nobody may be blocked or charged.
async function liveFlag() {
  if (!URL_ || !KEY) return false;
  try {
    const r = await rows("app_flags?key=eq.cobuild_live&select=value&limit=1");
    const v = r && r[0] && r[0].value;
    return v === true || v === "true";
  } catch { return false; }
}

// ---------------------------------------------------------------------------
//  THE ROW. Read it, roll the month if the month has rolled, and never invent a
//  plan a family did not buy: a family we have never seen is "preview".
// ---------------------------------------------------------------------------
async function planRow(familyId) {
  if (!URL_ || !KEY || !familyId) return null;
  const r = await rows(`cobuild_plans?family_id=eq.${enc(familyId)}&select=*&limit=1`);
  return (r && r[0]) || null;
}
export function periodOver(row) {
  const start = Date.parse(row.period_start || "") || 0;
  return start > 0 && (Date.now() - start) >= PERIOD_DAYS * 864e5;
}
async function rollIfDue(row) {
  if (!row || !periodOver(row)) return row;
  // A new month: the meter goes back to nought and any add-on games the family
  // bought are used up with the old month rather than stacking forever.
  const months = Math.floor((Date.now() - Date.parse(row.period_start)) / (PERIOD_DAYS * 864e5));
  const patch = { games_used: 0, extra_games: 0,
    period_start: new Date(Date.parse(row.period_start) + months * PERIOD_DAYS * 864e5).toISOString(),
    updated_at: new Date().toISOString() };
  const up = await sb(`cobuild_plans?family_id=eq.${enc(row.family_id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
  const out = await up.json().catch(() => null);
  return (Array.isArray(out) && out[0]) || { ...row, ...patch };
}
async function upsert(familyId, patch) {
  const now = new Date().toISOString();
  const cur = await planRow(familyId);
  if (cur) {
    const up = await sb(`cobuild_plans?family_id=eq.${enc(familyId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: now }) });
    const out = await up.json().catch(() => null);
    return (Array.isArray(out) && out[0]) || null;
  }
  const ins = await sb("cobuild_plans", { method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ family_id: familyId, period_start: now, created_at: now, updated_at: now, ...patch }) });
  const out = await ins.json().catch(() => null);
  return (Array.isArray(out) && out[0]) || null;
}

// What the grown-up page shows, in the words it shows them.
export function asPlan(row, live) {
  if (!row) return { plan: "preview", label: "Preview", status: "preview", included: 0, used: 0, extra: 0,
    left: live ? 0 : null, renews: null, live, said: live ? "No plan yet." : "You are in the preview. Everything is free while we test." };
  const included = row.games_included || 0, used = row.games_used || 0, extra = row.extra_games || 0;
  const left = Math.max(0, included + extra - used);
  const renews = row.period_start ? new Date(Date.parse(row.period_start) + PERIOD_DAYS * 864e5).toISOString() : null;
  const nice = renews ? new Date(renews).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "";
  return { plan: row.plan, label: (PLANS[row.plan] || {}).label || "Preview", status: row.status, included, used, extra,
    left, renews, live, hasSub: !!row.stripe_sub,
    said: row.plan === "preview" || row.plan === "none"
      ? "You are in the preview. Everything is free while we test."
      : used + " of " + (included + extra) + " new games this month, renews " + nice + ". Edits are always free." };
}

// ---------------------------------------------------------------------------
//  THE METER. Exported so anything that builds a game can ask, and so there is
//  exactly one place that knows an edit is free.
// ---------------------------------------------------------------------------
export async function meterCheck(familyId, kind) {
  const live = await liveFlag();
  const cost = COST[kind] != null ? COST[kind] : COST.new;
  if (cost === 0) return { ok: true, allowed: true, free: true, why: "edits are always free" };
  if (!live) return { ok: true, allowed: true, preview: true, why: "the preview is free while we test" };
  let row = await planRow(familyId);
  if (!row) return { ok: true, allowed: false, left: 0, why: "there is no plan on this family yet" };
  row = await rollIfDue(row);
  if (row.status !== "active") return { ok: true, allowed: false, left: 0, why: "the plan is " + row.status };
  const left = (row.games_included || 0) + (row.extra_games || 0) - (row.games_used || 0);
  if (left < cost) return { ok: true, allowed: false, left: Math.max(0, left), why: "this month's new games are used up" };
  return { ok: true, allowed: true, left, cost };
}
export async function meterCount(familyId, kind) {
  const cost = COST[kind] != null ? COST[kind] : COST.new;
  if (cost === 0) return { ok: true, counted: 0, free: true };
  if (!(await liveFlag())) return { ok: true, counted: 0, preview: true };
  let row = await planRow(familyId);
  if (!row) return { ok: true, counted: 0, why: "no plan on this family" };
  row = await rollIfDue(row);
  const used = (row.games_used || 0) + cost;
  await sb(`cobuild_plans?family_id=eq.${enc(familyId)}`, { method: "PATCH", body: JSON.stringify({ games_used: used, updated_at: new Date().toISOString() }) });
  return { ok: true, counted: cost, used, left: Math.max(0, (row.games_included || 0) + (row.extra_games || 0) - used) };
}

// ---------------------------------------------------------------------------
//  STRIPE. Form-encoded REST, no SDK, so nothing new is installed and the whole
//  call is readable. The key is read by name and never logged or returned.
// ---------------------------------------------------------------------------
async function stripe(path, form) {
  const body = new URLSearchParams();
  const walk = (obj, prefix) => {
    for (const k of Object.keys(obj)) {
      const v = obj[k], key = prefix ? prefix + "[" + k + "]" : k;
      if (v == null) continue;
      if (typeof v === "object") walk(v, key); else body.append(key, String(v));
    }
  };
  walk(form || {}, "");
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST", headers: { Authorization: "Bearer " + STRIPE_KEY, "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const j = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body: j };
}

async function checkout(familyId, which, email) {
  const isAddon = which === "addon";
  const spec = isAddon ? ADDON : PLANS[which];
  if (!spec) return { ok: false, error: "unknown plan" };
  const price = spec.price();
  if (!STRIPE_KEY || !price) return { ok: false, reason: "not_open", error: "the checkout is not switched on yet" };
  const r = await stripe("checkout/sessions", {
    mode: isAddon ? "payment" : "subscription",
    "line_items[0][price]": price, "line_items[0][quantity]": 1,
    success_url: SITE + "/studio/grownups?paid=1",
    cancel_url: SITE + "/cobuild",
    client_reference_id: familyId,
    ...(email ? { customer_email: email } : {}),
    "metadata[family_id]": familyId, "metadata[kind]": isAddon ? "addon" : which,
  });
  if (!r.ok || !r.body || !r.body.url) return { ok: false, error: "the checkout would not open", detail: (r.body && r.body.error && r.body.error.message) || null };
  return { ok: true, url: r.body.url };
}

// The webhook is what makes the row honest: a family's plan is whatever Stripe
// says it is, never whatever the browser claimed. It is verified or refused;
// there is no "trust it anyway" path.
function verified(raw, sig) {
  if (!WEBHOOK_SECRET || !sig || !raw) return false;
  const parts = {};
  String(sig).split(",").forEach((p) => { const i = p.indexOf("="); if (i > 0) parts[p.slice(0, i).trim()] = (parts[p.slice(0, i).trim()] || p.slice(i + 1).trim()); });
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;   // a replay of an old event
  const want = crypto.createHmac("sha256", WEBHOOK_SECRET).update(parts.t + "." + raw).digest("hex");
  const a = Buffer.from(want), b = Buffer.from(String(parts.v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function onStripeEvent(ev) {
  const o = (ev && ev.data && ev.data.object) || {};
  const meta = o.metadata || {};
  const familyId = str(meta.family_id || o.client_reference_id, 80);
  if (ev.type === "checkout.session.completed") {
    if (!familyId) return;
    if (meta.kind === "addon") {
      const row = await planRow(familyId);
      await upsert(familyId, { extra_games: ((row && row.extra_games) || 0) + ADDON.games });
      return;
    }
    const spec = PLANS[meta.kind] || PLANS.cobuild;
    await upsert(familyId, { plan: meta.kind || "cobuild", games_included: spec.games, games_used: 0, extra_games: 0,
      status: "active", period_start: new Date().toISOString(),
      stripe_customer: str(o.customer, 80) || null, stripe_sub: str(o.subscription, 80) || null, email: str(o.customer_email || o.customer_details && o.customer_details.email, 200) || null });
    return;
  }
  if (ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
    const sub = str(o.id, 80);
    const r = await rows(`cobuild_plans?stripe_sub=eq.${enc(sub)}&select=family_id&limit=1`);
    const fam = r && r[0] && r[0].family_id;
    if (!fam) return;
    const status = ev.type === "customer.subscription.deleted" ? "canceled"
      : (o.status === "active" || o.status === "trialing") ? "active" : (o.status === "past_due" ? "past_due" : str(o.status, 20) || "active");
    await sb(`cobuild_plans?family_id=eq.${enc(fam)}`, { method: "PATCH", body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    // --- the webhook. Signed, or refused. -----------------------------------
    const sig = req.headers && (req.headers["stripe-signature"] || req.headers["Stripe-Signature"]);
    if (req.method === "POST" && sig) {
      const raw = (req.body && typeof req.body === "string") ? req.body : await rawBody(req);
      if (!verified(raw, sig)) return res.status(400).json({ ok: false, error: "signature did not check out" });
      let ev = null; try { ev = JSON.parse(raw); } catch { return res.status(400).json({ ok: false, error: "bad event" }); }
      await onStripeEvent(ev);
      return res.status(200).json({ ok: true, handled: ev.type });
    }

    const q = new URLSearchParams(String(req.url || "").split("?")[1] || "");
    const body = req.method === "POST" ? await readBody(req) : {};
    const get = (k) => (body && body[k] != null ? body[k] : q.get(k));
    const op = str(get("op"), 20) || "plan";
    const familyId = str(get("familyId"), 80);
    if (!URL_ || !KEY) return res.status(503).json({ ok: false, error: "not configured" });
    if (!familyId) return res.status(400).json({ ok: false, error: "familyId required" });

    if (op === "plan") {
      let row = await planRow(familyId);
      if (row) row = await rollIfDue(row);
      return res.status(200).json({ ok: true, plan: asPlan(row, await liveFlag()), prices: { cobuild: PLANS.cobuild.monthly, premium: PLANS.premium.monthly, addon: ADDON.once } });
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ ok: false, error: "POST only for " + op }); }

    if (op === "check") return res.status(200).json(await meterCheck(familyId, str(get("kind"), 12) || "new"));
    if (op === "count") return res.status(200).json(await meterCount(familyId, str(get("kind"), 12) || "new"));
    if (op === "checkout") {
      const which = str(get("plan"), 20);
      const out = await checkout(familyId, PLANS[which] ? which : "cobuild", str(get("email"), 200));
      return res.status(out.ok ? 200 : 200).json(out);
    }
    if (op === "addon") return res.status(200).json(await checkout(familyId, "addon", str(get("email"), 200)));
    if (op === "portal") {
      const row = await planRow(familyId);
      if (!STRIPE_KEY) return res.status(200).json({ ok: false, reason: "not_open" });
      if (!row || !row.stripe_customer) return res.status(200).json({ ok: false, error: "there is nothing to manage yet" });
      const r = await stripe("billing_portal/sessions", { customer: row.stripe_customer, return_url: SITE + "/studio/grownups" });
      if (!r.ok || !r.body || !r.body.url) return res.status(200).json({ ok: false, error: "the billing page would not open" });
      return res.status(200).json({ ok: true, url: r.body.url });
    }
    return res.status(400).json({ ok: false, error: "unknown op '" + op + "'" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
