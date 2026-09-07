// /api/cobuild-grownup.js  POST { op:"open", code }  ->  { ok, token, expires }
//
//  The only door into grown-up mode. The code itself never leaves the server:
//  the page sends what was typed and gets back a signed token (or a no), so
//  view-source teaches a curious child nothing. See api/_grownup.js.
import { codeIsRight, mintToken } from "./_grownup.js";

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "POST only" }); }
  const b = await readBody(req);
  if (!codeIsRight(b && b.code)) {
    await wait(400);            // slow down a child trying every four digits
    return res.status(403).json({ ok: false, error: "Not that one. Try again." });
  }
  const token = mintToken();
  return res.status(200).json({ ok: true, token, expires: parseInt(token.split(".")[0], 10) });
}
