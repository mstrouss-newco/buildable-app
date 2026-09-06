// qa-kid-lane.mjs — the check that was missing when a kid's work went missing.
//
// THE RULE THIS ENFORCES: save something, then list it back by kid, and the
// count MUST go up. Nothing a child makes may be saved to a cheerful message
// and then be absent from the shelf a second later.
//
// WHAT WENT WRONG (live site, 2026-08-30). A kid was playing under a profile
// stored only in the browser (bk_guest_kid_profiles_v1) while a grown-up was
// signed in. That id has no row in kid_profiles, so:
//   - the insert hit a foreign-key error,
//   - save-song deliberately retried with kid_profile_id null and still
//     answered a bare ok:true,
//   - the app read only j.ok and said "Saved to My Songs!",
//   - My Songs lists BY KID, found nothing, and showed (0).
// The song was on the server the whole time. Same story for drawings:
// "Saved to your gallery!" then "No saved art yet".
//
// So this harness drives the REAL api handlers against an in-memory PostgREST
// that ENFORCES the foreign key, the way the live database does, and fails on
// any of: a save that lies about where it went, a list that loses a row, or a
// maker that sends a device-local guest id to the server as if it were real.
//
// No network, no browser. Run: node qa-kid-lane.mjs [repoDir]
import fs from "fs";
import path from "path";

const dir = process.argv[2] || ".";
process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_KEY = "svc";

// ---- in-memory tables -----------------------------------------------------
const T = { saved_songs: [], saved_art: [], saved_stories: [] };
// The ONLY ids that exist in kid_profiles. Anything else is a device-local
// guest id, and the database will refuse it -- exactly like production.
const kidRows = new Set(["11111111-1111-4111-8111-111111111111"]);
const REAL_KID = "11111111-1111-4111-8111-111111111111";
const GUEST_KID = "guest-kid-not-in-the-database";
const DEVICE = "dev-test-tablet";

const reply = (ok, status, body) => ({
  ok, status,
  json: async () => body,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

// api/friends.js verifies the caller's parent JWT through GoTrue and then reads
// kid_profiles / game_invites / friend_matches. Everything it needs lives here so
// the invite path can be driven without a network.
const PARENT = "parent-1";
T.kid_profiles = [{ id: REAL_KID, parent_id: PARENT, name: "Riley", avatar: "fox", last_seen: new Date().toISOString(), created_at: new Date().toISOString() }];
T.game_invites = [];
T.friend_matches = [];
T.family_friends = [];
T.parent_accounts = [{ id: PARENT, email: "grownup@test", friend_code: "ABC123" }];

global.fetch = async (url, opt = {}) => {
  const u = new URL(url);
  if (u.pathname.endsWith("/auth/v1/user")) {
    const auth = (opt.headers && (opt.headers.Authorization || opt.headers.authorization)) || "";
    return /good-token/.test(auth) ? reply(true, 200, { id: PARENT }) : reply(false, 401, {});
  }
  const table = u.pathname.split("/rest/v1/")[1];
  const method = (opt.method || "GET").toUpperCase();
  const rows = T[table];
  if (!rows) return reply(false, 404, "unknown table " + table);

  if (method === "POST") {
    const rec = JSON.parse(opt.body || "{}");
    // THE FOREIGN KEY — the whole reason this harness exists. A kid_profile_id
    // with no matching row is rejected, just as Postgres rejects it live.
    if (rec.kid_profile_id && !kidRows.has(rec.kid_profile_id)) {
      return reply(false, 409, 'insert or update on table "' + table +
        '" violates foreign key constraint "' + table + '_kid_profile_id_fkey"');
    }
    // PostgREST hands back the row the database made, complete with its
    // generated id -- friends.js reads created[0].id to start the match.
    const row = { id: table + "-" + (rows.length + 1), ...rec, created_at: new Date().toISOString() };
    rows.push(row);
    return reply(true, 201, [row]);
  }

  let out = rows.slice();
  for (const [k, v] of u.searchParams.entries()) {
    // "or=(...)", "expires_at=gt...." and friends: not worth emulating, and not
    // what this harness is testing. Only plain eq. filters narrow the rows.
    if (k === "select" || k === "order" || k === "limit" || k === "or") continue;
    const raw = String(v);
    if (!raw.startsWith("eq.")) continue;
    const want = raw.slice(3);
    out = out.filter((r) => String(r[k] == null ? "" : r[k]) === want);
  }
  return reply(true, 200, out.reverse()); // newest first
};

// ---- tiny req/res harness (same shape as qa-invite.mjs) -------------------
const load = (f) => import(path.resolve(dir, "api/" + f)).then((m) => m.default);
const saveSong = await load("save-song.js");
const listSongs = await load("list-songs.js");
const saveArt = await load("save-art.js");
const listArt = await load("list-art.js");
const saveStory = await load("save-story.js");
const listStories = await load("list-stories.js");

function call(handler, { method = "GET", query = {}, body = null }) {
  return new Promise((resolve) => {
    const req = { method, query, body, headers: {} };
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); return this; },
    };
    Promise.resolve(handler(req, res)).catch((e) => resolve({ status: 500, body: { error: String(e) } }));
  });
}

let failed = 0;
const check = (cond, label) => {
  console.log((cond ? "  PASS" : "  FAIL") + " — " + label);
  if (!cond) failed++;
};

console.log("KID LANE QA — save it, then list it, and the count must go up");

// ===========================================================================
// 1. A player with a REAL profile row. The happy path must actually work.
// ===========================================================================
console.log("--- a player with a real kid_profiles row ---");
for (const [name, save, list, mkBody, listKey] of [
  ["song", saveSong, listSongs,
    (kid) => ({ deviceId: DEVICE, kidProfileId: kid, title: "My tune", audioUrl: "http://a/x.mp3" }), "songs"],
  ["drawing", saveArt, listArt,
    (kid) => ({ device_id: DEVICE, kid_profile_id: kid, title: "My picture", art: { ops: [{ t: "s" }] } }), "art"],
  ["story", saveStory, listStories,
    (kid) => ({ deviceId: DEVICE, kidProfileId: kid, title: "My story", story: { pages: [{ text: "once" }] } }), "stories"],
]) {
  const before = await call(list, { query: { deviceId: DEVICE, kidProfileId: REAL_KID } });
  const n0 = (before.body[listKey] || []).length;
  const saved = await call(save, { method: "POST", body: mkBody(REAL_KID) });
  check(saved.status === 200 && saved.body.ok === true, `${name}: saving answers ok`);
  check(saved.body.lane === "kid", `${name}: the answer says it was filed under the kid (lane=${saved.body.lane})`);
  const after = await call(list, { query: { deviceId: DEVICE, kidProfileId: REAL_KID } });
  const n1 = (after.body[listKey] || []).length;
  check(n1 === n0 + 1, `${name}: listing BY KID went from ${n0} to ${n1} (it must go up)`);
}

// ===========================================================================
// 2. THE REPORTED BUG. A device-local guest id, which the database has never
//    heard of, while the app behaves as though it were real.
// ===========================================================================
console.log("--- a guest profile id the database does not know ---");
const gDevice = "dev-guest-tablet";
const gSong = await call(saveSong, { method: "POST",
  body: { deviceId: gDevice, kidProfileId: GUEST_KID, title: "Guest tune", audioUrl: "http://a/g.mp3" } });
check(gSong.status === 200 && gSong.body.ok === true, "song: the save still keeps the song rather than losing it");
check(gSong.body.lane === "device", `song: the answer NAMES the device lane instead of a bare ok:true (lane=${gSong.body.lane})`);
check(gSong.body.savedToKid === false, "song: the answer says plainly it is not filed under the kid");

const gArt = await call(saveArt, { method: "POST",
  body: { device_id: gDevice, kid_profile_id: GUEST_KID, title: "Guest picture", art: { ops: [{ t: "s" }] } } });
check(gArt.status === 200 && gArt.body.ok === true, "drawing: the save still keeps the drawing");
check(gArt.body.lane === "device", `drawing: the answer NAMES the device lane (lane=${gArt.body.lane})`);

// ...and now the part that was broken: asking for it back.
const gSongs = await call(listSongs, { query: { deviceId: gDevice, kidProfileId: GUEST_KID } });
check((gSongs.body.songs || []).length === 1,
  `song: it comes BACK when listed (got ${(gSongs.body.songs || []).length}) — this is the "Saved to My Songs!" then (0) bug`);
const gArts = await call(listArt, { query: { deviceId: gDevice, kidProfileId: GUEST_KID } });
check((gArts.body.art || []).length === 1,
  `drawing: it comes BACK when listed (got ${(gArts.body.art || []).length}) — this is the "No saved art yet" bug`);

// ===========================================================================
// 3. The device-lane fallback must not trample a kid who has work of their own.
// ===========================================================================
console.log("--- the fallback never pushes a sibling's list on top ---");
const mine = await call(listSongs, { query: { deviceId: DEVICE, kidProfileId: REAL_KID } });
check(mine.body.lane === "kid", `a kid with their own songs is still served the KID lane (lane=${mine.body.lane})`);
check((mine.body.songs || []).every((r) => r.kid_profile_id === REAL_KID),
  "every song served to that kid is genuinely theirs");

// ===========================================================================
// 4. The prevention, which lives in the browser: a maker must never send a
//    device-local guest id to the server as if it were a real profile.
// ===========================================================================
console.log("--- the makers only send an id the server knows ---");
const src = (f) => fs.readFileSync(path.resolve(dir, f), "utf8");
for (const f of ["src/MusicMaker.jsx", "src/StoryMaker.jsx", "src/MyStuff.jsx", "public/art-studio.html"]) {
  const t = src(f);
  check(/lane\s*===\s*"account"/.test(t),
    `${f} gates the kid id on lane === "account"`);
}
check(/export async function ensureServerKidProfile/.test(src("src/lib/accounts.js")),
  "lib/accounts gives a guest player a real profile row (ensureServerKidProfile)");
check(/ensureServerKidProfile/.test(src("src/MusicMaker.jsx")),
  "MusicMaker adopts the player on save, per the rule");

// ===========================================================================
// 5. QA43 — an invite from the ACTIVE kid must come back 200, not a silent 403.
// ===========================================================================
console.log("--- an invite from a real player is accepted ---");
const friends = await load("friends.js");
const inviteAs = (fromKid) => call(friends, { method: "POST",
  body: { action: "invite", fromKid, toKid: REAL_KID, game: "connectfour", transport: "turns" } });

// friends.js reads the token off the request headers, so hand it one.
const callFriends = (fromKid, token) => new Promise((resolve) => {
  const req = { method: "POST", query: {}, headers: { authorization: "Bearer " + token },
    body: { action: "invite", fromKid, toKid: REAL_KID, game: "connectfour", transport: "turns" } };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; },
    json(o) { resolve({ status: this.statusCode, body: o }); return this; } };
  Promise.resolve(friends(req, res)).catch((e) => resolve({ status: 500, body: { error: String(e) } }));
});
const goodInvite = await callFriends(REAL_KID, "good-token");
check(goodInvite.status === 200, `invite from a real player returns 200 (got ${goodInvite.status} ${JSON.stringify(goodInvite.body).slice(0, 90)})`);
check(Boolean(goodInvite.body.matchId), "a turn-based invite creates the match right away");

const guestInvite = await callFriends(GUEST_KID, "good-token");
check(guestInvite.status === 403 && /not your player/.test(String(guestInvite.body.error)),
  "an invite from a device-local guest id is still refused — this is the 403 the kid never saw");

// ===========================================================================
// 6. QA44 — the notifications bell must appear when a turn is waiting.
// ===========================================================================
console.log("--- the notifications bell reaches the screen ---");
const home = src("src/BuildableKids.jsx");
check(/<FriendsPill/.test(home), "FriendsPill is actually RENDERED (it was defined and used nowhere)");
check(/const alertCount = [\s\S]{0,260}chessTurns[\s\S]{0,260}friendTurns/.test(home),
  "its badge counts chess turns, friend turns and invites from the same state Home already polls");
check(/alertCount > 0 && \(\s*<FriendsPill/.test(home),
  "it appears when something is waiting, and a quiet Home stays quiet");
check(/data-nv2-header[\s\S]{0,1400}<FriendsPill/.test(home), "it sits in the Home header, beside the coins");
check(!/const People = \(\) => \(/.test(home), 'the bell glyph is no longer mis-named "People"');

console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL KID-LANE CHECKS PASS");
process.exit(failed ? 1 : 0);
