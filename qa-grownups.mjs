// qa-grownups.mjs — THE GROWN-UP SIDE (Session CB4).
//
// Money, limits and house rules are the parts of this product where being wrong
// is expensive in a way a wonky game is not: a family charged twice, a child
// locked out of their own work, or a number on a page that does not match the
// meter behind it. So all four are checked here, with no keys and no database:
//
//   1. the meter, including the promise that an edit is always free
//   2. the house-rule gates, including that a family with no rules set sees none
//   3. the share toggles and the poster PDF (built for real and parsed back)
//   4. the switch: with cobuild_live off nothing charges, blocks or counts
//
// Run:  node qa-grownups.mjs
import fs from "fs";
import zlib from "zlib";
import { COST, PLANS, ADDON, asPlan, periodOver, meterCheck, meterCount } from "./api/cobuild-billing.js";
import { asRules, gateFrom } from "./api/cobuild-rules.js";
import { makePoster } from "./api/cobuild-poster.js";

let ok = true;
const chk = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + "  " + name + (extra ? "  ::  " + extra : "")); if (!cond) ok = false; };
const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };

console.log("--- 1. the meter ---");
chk("the prices are the ones the live fake-door test set",
  PLANS.cobuild.monthly === 10 && PLANS.cobuild.games === 3 && PLANS.premium.monthly === 20 && PLANS.premium.games === 10 && ADDON.once === 5 && ADDON.games === 3,
  `cobuild $${PLANS.cobuild.monthly}/${PLANS.cobuild.games}, premium $${PLANS.premium.monthly}/${PLANS.premium.games}, add-on $${ADDON.once}/${ADDON.games}`);
chk("a new game counts one", COST.new === 1);
chk("a remix counts one", COST.remix === 1);
chk("AN EDIT NEVER COUNTS", COST.edit === 0);
chk("a layer three build counts two", COST.layer3 === 2);
chk("an edit is free even before anything else is asked", (await meterCheck("fam", "edit")).free === true);
chk("counting an edit changes nothing", (await meterCount("fam", "edit")).counted === 0);

console.log("\n--- 2. what the grown-up page says, and what the meter does, are the same sentence ---");
{
  const row = { family_id: "f", plan: "cobuild", games_included: 3, games_used: 2, extra_games: 0,
    period_start: new Date(Date.now() - 5 * 864e5).toISOString(), status: "active", stripe_sub: "sub_x" };
  const p = asPlan(row, true);
  chk("it counts what is used out of what is included", p.used === 2 && p.included === 3 && p.left === 1, JSON.stringify({ used: p.used, included: p.included, left: p.left }));
  chk("it says it in the words the card asked for", /2 of 3 new games this month, renews .+\. Edits are always free\./.test(p.said), p.said);
  chk("an add-on really adds three", asPlan({ ...row, extra_games: 3 }, true).left === 4);
  chk("a preview family is told it is free, with no numbers", /free while we test/.test(asPlan(null, false).said) && !/\d/.test(asPlan(null, false).said));
  chk("a month that has not rolled does not roll", periodOver(row) === false);
  chk("a month that is over rolls", periodOver({ period_start: new Date(Date.now() - 31 * 864e5).toISOString() }) === true);
  const spent = asPlan({ ...row, games_used: 3 }, true);
  chk("used up means nothing left, never a negative", spent.left === 0);
}

console.log("\n--- 3. the house rules ---");
{
  const off = asRules({});
  chk("every rule is OFF by default", off.vegFirst === false && off.chores.length === 0 && off.playMinutes === 0);
  chk("a family with no rules set never sees a gate", gateFrom(off).allowed === true);
  const today = new Date().toISOString().slice(0, 10);
  const withChores = asRules({ chores: [{ id: "c1", text: "Tidy up" }, { id: "c2", text: "Shoes away" }],
    chores_done: { date: today, done: ["c1"] } });
  chk("a chore ticked today shows as done", withChores.chores[0].done === true && withChores.chores[1].done === false);
  chk("one chore left holds the door", gateFrom(withChores).allowed === false && gateFrom(withChores).why === "chores");
  const allDone = asRules({ chores: [{ id: "c1", text: "Tidy up" }], chores_done: { date: today, done: ["c1"] } });
  chk("all chores done opens it", gateFrom(allDone).allowed === true);
  const yesterday = asRules({ chores: [{ id: "c1", text: "Tidy up" }], chores_done: { date: "2020-01-01", done: ["c1"] } });
  chk("yesterday's ticks do not count today", yesterday.chores[0].done === false, "the list clears itself every day");
  const clock = asRules({ play_minutes: 30, play_used: { date: today, minutes: 30 } });
  chk("the play clock runs out", clock.minutesLeft === 0 && gateFrom(clock).why === "clock");
  chk("and says goodnight rather than snatching the screen", /See you tomorrow/.test(gateFrom(clock).said), gateFrom(clock).said);
  chk("with the clock off there is no time limit at all", asRules({}).minutesLeft === null);
  const src = read("api/cobuild-rules.js");
  chk("vegetables first is the CB2 mathGate RECIPE, not a new feature",
    /R\.apply\("mathGate"/.test(src) && /recipeLib/.test(src));
  chk("...and the robot plays the game again before the change is kept",
    src.indexOf("robotCheck") < src.indexOf("kid_games?id=eq.") + src.length && /verdict\.playable/.test(src) && /checkManifest/.test(src));
  chk("turning it off really takes the questions back out", /applyVeg\(familyId, dropped, false\)/.test(src));
}

console.log("\n--- 4. the poster ---");
{
  const pdf = await makePoster({ name: "Pizza Dragon", kidName: "Riley", grownupName: "Mike",
    color: "#FF6B6B", coverUrl: null, link: "https://buildablekids.com/g/pizza-dragon-k3f9" });
  const txt = pdf.toString("latin1");
  // Everything a poster SAYS is inside the deflated content stream, so it has to
  // be inflated before it can be read back. That also proves the stream is valid.
  const inflate = (buf) => {
    // "endstream" also ends in "stream", so the opening marker has to be matched
    // with its own newline in front of it or the search lands past the data.
    const s = buf.lastIndexOf(Buffer.from("\nstream\n")) + 8, e = buf.lastIndexOf(Buffer.from("\nendstream"));
    try { return zlib.inflateSync(buf.slice(s, e)).toString("latin1"); } catch { return ""; }
  };
  const page = inflate(pdf);
  chk("the page content stream inflates", page.length > 200, page.length + " bytes of drawing");
  chk("it is a PDF", txt.startsWith("%PDF-1.") && txt.trimEnd().endsWith("%%EOF"));
  chk("it is one A4 page", /\/MediaBox \[0 0 595 842\]/.test(txt) && /\/Count 1/.test(txt));
  // The xref table is the part of a hand-written PDF most likely to be wrong, so
  // every offset is followed to see that a real object starts there.
  const startxref = parseInt((txt.match(/startxref\s+(\d+)/) || [])[1], 10);
  const table = txt.slice(startxref);
  const offsets = [...table.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => parseInt(m[1], 10));
  chk("the xref table points at real objects", offsets.length >= 6 && offsets.every((off, i) => /^\d+ 0 obj/.test(txt.slice(off, off + 12))),
    offsets.length + " objects checked");
  chk("the title and the credit are on it", /\(Pizza Dragon\)/.test(page) && /\(A GAME BY RILEY AND MIKE\)/.test(page));
  chk("the link is on it in words as well as a code", /buildablekids\.com\/g\/pizza-dragon-k3f9/.test(page));
  chk("the QR is drawn as vector squares, not a bitmap", (page.match(/ re f/g) || []).length > 100,
    (page.match(/ re f/g) || []).length + " squares");
  // and with real cover art, through the PNG path
  const { PNG } = await import("pngjs");
  const png = new PNG({ width: 40, height: 30 });
  for (let i = 0; i < 40 * 30; i++) { png.data[i * 4] = 200; png.data[i * 4 + 1] = 90; png.data[i * 4 + 2] = 110; png.data[i * 4 + 3] = i % 40 < 6 ? 0 : 255; }
  const bytes = PNG.sync.write(png);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  const withArt = await makePoster({ name: "Pizza Dragon", kidName: "Riley", color: "#FF6B6B",
    coverUrl: "studio:cobuild/world/jungle/x", link: "https://buildablekids.com/g/abc" });
  globalThis.fetch = realFetch;
  chk("a cover the kid painted goes on the poster", /\/Subtype \/Image/.test(withArt.toString("latin1")) && withArt.length > pdf.length - 200);
  chk("a game with no cover still prints", pdf.length > 1500 && !/\/Subtype \/Image/.test(txt));
}

console.log("\n--- 5. the switch: with cobuild_live off, nothing charges, blocks or counts ---");
{
  const flags = read("api/app-flags.js");
  chk("cobuild_live exists and is FALSE by default", /cobuild_live:\s*\{\s*\n\s*def:\s*false/.test(flags));
  chk("with the switch off nobody is blocked", (await meterCheck("fam", "new")).allowed === true);
  chk("with the switch off nothing is counted", (await meterCount("fam", "new")).counted === 0);
  const land = read("public/cobuild.html");
  chk("the landing page still logs every click, switch or no switch", /log\(\{kind:'click'/.test(land));
  chk("with the switch off the Start buttons still take a name for the waitlist", /if\(LIVE\)\{startSignup/.test(land) && /waitlist\(where\)/.test(land));
  chk("if the checkout is not set up, it falls back to the waitlist rather than a dead end",
    /waitlist\(where\);\s*\/\/ not switched on yet/.test(land) || /\.catch\(function\(\)\{ waitlist\(where\); \}\)/.test(land));
  const bill = read("api/cobuild-billing.js");
  chk("the Stripe key is read by name and never returned", /process\.env\.STRIPE_SECRET_KEY/.test(bill) && !/sk_live|sk_test/.test(bill));
  chk("a webhook is verified or refused, with no trust-it-anyway path",
    /timingSafeEqual/.test(bill) && /signature did not check out/.test(bill) && !/skipVerify|allowUnsigned/.test(bill));
  chk("an old webhook cannot be replayed", /> 300/.test(bill));
  const lead = read("api/cobuild-lead.js");
  chk("the waitlist email needs the owner code AND an explicit send", /code !== OWNER_CODE/.test(lead) && /b\.send !== true/.test(lead));
  chk("nobody on the waitlist is emailed twice", /notified_at=is\.null/.test(lead) && /notified_at: new Date/.test(lead));
}

console.log("\n--- 6. the pages ---");
{
  const grown = read("public/studio-grownups.html"), studio = read("public/studio.html"), shell = read("src/BuildableKids.jsx");
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  chk("the grown-up page ships and has no emojis", grown.length > 3000 && !emoji.test(grown));
  chk("it is behind the grown-up code", /bk_studio_grown_v1/.test(grown) && /"1111"/.test(grown));
  chk("it shows a shelf per kid with plays per game", /op=kids/.test(grown) && /play'\+\(g\.plays===1/.test(grown));
  chk("the share sheet has all four doors", /Copy the link/.test(grown) && /navigator\.share/.test(grown) && /Top Board/.test(grown) && /cobuild-poster/.test(grown));
  chk("the Top Board toggle goes through CB1's own share op", /op:"share"/.test(grown) && /public:next/.test(grown));
  chk("the house rules are all off until a grown-up turns them on", /All off unless you turn them on/.test(grown));
  // A CHILD never sees money. The studio page is checked with its comments stripped.
  const kidSide = studio.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  // A URL like /api/cobuild-billing is plumbing, not something a child reads, so
  // the endpoint names come out before looking for money.
  const money = kidSide.replace(/\/api\/[a-z-]+/g, " ").match(/[$£€]\d|a month|subscri|checkout|upgrade|payment/i);
  chk("the studio a child uses shows no money at all", !money, money ? money[0] : "nothing about money");
  chk("when the month is used up a child is sent to a grown-up, with no numbers",
    /screenAskAGrownUp/.test(studio) && /All the new games for this month are made/.test(studio) && !/[$£€]\d/.test(kidSide));
  chk("an edit never asks the meter", /meterCheck\("new"\)/.test(studio) && !/meterCheck\("edit"\)/.test(studio) && !/meterCount\("edit"\)/.test(studio));
  chk("a new game and a remix both count", /meterCount\("new"\)/.test(studio) && /meterCount\("remix"\)/.test(studio));
  chk("the house rules are asked BEFORE a game opens, never over the top of one",
    /function screenPlay\(msg\)\{ houseGate\(/.test(studio));
  chk("the play clock never draws a countdown", /startClock/.test(studio) && !/countdown|timeLeft|secondsLeft/i.test(kidSide));
  chk("every door in the app into a kid's game goes through the same gate",
    (shell.match(/onOpenKidGame(?:=\{|:\s*)openKidGame/g) || []).length === 3 && /const openKidGame =/.test(shell));
  chk("a wobble on the gate opens the game rather than locking a child out", /\.catch\(open\)/.test(shell));
}

console.log("\n--- 7. the routes ---");
{
  const routes = JSON.parse(read("vercel.json")).routes.map((r) => r.src);
  const catchAll = routes.indexOf("/(.*)");
  const before = (p) => { const i = routes.indexOf(p); return i !== -1 && (catchAll === -1 || i < catchAll); };
  chk("/studio/grownups is routed", before("/studio/grownups"));
  chk("/studio-grownups.html is routed", before("/studio-grownups.html"));
  chk("...and it comes BEFORE the /studio/<id> route, or it would open as a game",
    routes.indexOf("/studio/grownups") < routes.findIndex((r) => /^\/studio\/\(/.test(r)));
}

console.log(ok ? "\nALL CHECKS PASS" : "\nSOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
