// /api/cobuild-poster.js — PRINT THE POSTER (Session CB4, Premium).
//
// A child's game, on the fridge. One A4 page: the cover art they made, the title
// they chose, "A GAME BY <kid>", and a QR code anyone can point a phone at to
// play it. Generated server-side and handed back as a real PDF, so it prints the
// same from a phone, an iPad or a laptop.
//
//   GET /api/cobuild-poster?id=<kid game id>[&familyId=..]  -> application/pdf
//
// WHO CAN PRINT ONE. The game must be the family's own, or already shared. A
// poster carries a link, so printing one for a game that is not shared would be
// handing out a link the family never chose to hand out; the endpoint shares it
// (the same private /g/ link CB1 already ships) rather than leaking it silently,
// and says so in the response header.
//
// The PDF is written by hand rather than with a document library: one page, a
// handful of text runs, the QR as vector squares, and the cover as an image
// stream. The cover is re-encoded from its PNG with pngjs + zlib, because a PDF
// image wants raw samples and a PNG's own bytes are filtered. A game with no
// cover gets a painted card in its own colour instead of a hole.
import zlib from "zlib";
import QRCode from "qrcode";
import { PNG } from "pngjs";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const SITE = process.env.APP_URL || "https://buildablekids.com";
const enc = encodeURIComponent;
const A4 = { w: 595, h: 842 };                 // points, at 72 per inch

const esc = (s) => String(s == null ? "" : s).replace(/[\\()]/g, (m) => "\\" + m).slice(0, 120);
const up = (s) => String(s == null ? "" : s).toUpperCase();

async function rows(p) {
  if (!URL_ || !KEY) return null;
  const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return Array.isArray(j) ? j : null;
}

// The cover, as something a PDF can draw: raw RGB samples, deflated. Returns null
// when there is no usable picture, which is a poster with a painted card on it,
// never a broken one.
async function coverImage(cover, host) {
  if (!cover) return null;
  let url = String(cover);
  if (url.indexOf("studio:") === 0) url = "/api/asset-studio?asset=" + enc(url.slice(7));
  else if (!/^https?:|^\//.test(url)) url = "/api/asset-studio?asset=" + enc(url);
  if (url.startsWith("/")) url = (host || SITE).replace(/\/$/, "") + url;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const png = PNG.sync.read(buf);                       // throws on anything that is not a PNG
    const n = png.width * png.height;
    const rgb = Buffer.alloc(n * 3);
    // Flatten any transparency onto white: a poster is printed on paper, and paper
    // has no alpha channel.
    for (let i = 0; i < n; i++) {
      const a = png.data[i * 4 + 3] / 255;
      rgb[i * 3] = Math.round(png.data[i * 4] * a + 255 * (1 - a));
      rgb[i * 3 + 1] = Math.round(png.data[i * 4 + 1] * a + 255 * (1 - a));
      rgb[i * 3 + 2] = Math.round(png.data[i * 4 + 2] * a + 255 * (1 - a));
    }
    return { w: png.width, h: png.height, data: zlib.deflateSync(rgb) };
  } catch { return null; }
}

// The QR, as PDF path operators. Vector squares print crisply at any size, which
// a scaled-up bitmap does not.
function qrOps(url, x, y, size) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, d = qr.modules.data;
  const cell = size / n;
  let ops = "0 0 0 rg\n";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!d[r * n + c]) continue;
      // +0.4 on the width closes the hairline gaps some printers leave between cells
      ops += (x + c * cell).toFixed(2) + " " + (y + (n - 1 - r) * cell).toFixed(2) + " " +
             (cell + 0.4).toFixed(2) + " " + (cell + 0.4).toFixed(2) + " re f\n";
    }
  }
  return { ops, modules: n };
}

const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return [0.49, 0.36, 0.99];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

// A one-page PDF, written out object by object. Nothing clever: a catalog, a
// page, two fonts, one content stream, and the cover as an XObject when there is
// one. Kept explicit so the next person can read what a poster actually is.
function buildPdf({ title, credit, url, color, image, qr }) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };          // 1-indexed object numbers
  const [cr, cg, cb] = hexRgb(color);

  let content = "";
  // the coloured band across the top
  content += `${cr.toFixed(3)} ${cg.toFixed(3)} ${cb.toFixed(3)} rg\n0 ${A4.h - 130} ${A4.w} 130 re f\n`;
  content += `1 1 1 rg\nBT /F1 30 Tf 56 ${A4.h - 78} Td (${esc(title)}) Tj ET\n`;
  content += `BT /F2 13 Tf 56 ${A4.h - 104} Td (${esc(up(credit))}) Tj ET\n`;
  // the cover, or a painted card in the game's own colour
  const boxY = A4.h - 130 - 360, boxH = 340, boxW = A4.w - 112;
  if (image) {
    const scale = Math.min(boxW / image.w, boxH / image.h);
    const w = image.w * scale, h = image.h * scale;
    content += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${(56 + (boxW - w) / 2).toFixed(2)} ${(boxY + (boxH - h) / 2).toFixed(2)} cm /Im1 Do Q\n`;
  } else {
    content += `${(cr * 0.25 + 0.75).toFixed(3)} ${(cg * 0.25 + 0.75).toFixed(3)} ${(cb * 0.25 + 0.75).toFixed(3)} rg\n`;
    content += `56 ${boxY} ${boxW} ${boxH} re f\n`;
    content += `${cr.toFixed(3)} ${cg.toFixed(3)} ${cb.toFixed(3)} rg\nBT /F1 46 Tf 56 ${boxY + boxH / 2} Td (${esc(title)}) Tj ET\n`;
  }
  // the QR and the words beside it
  content += `0 0 0 rg\nBT /F1 17 Tf 56 ${boxY - 62} Td (Point a phone at this to play it) Tj ET\n`;
  content += `0.35 0.35 0.4 rg\nBT /F2 11 Tf 56 ${boxY - 84} Td (${esc(url)}) Tj ET\n`;
  content += `BT /F2 10 Tf 56 56 Td (Made on Buildable Kids. Free to play, no account, no ads.) Tj ET\n`;
  content += qr.ops.replace(/^/, "");

  const stream = zlib.deflateSync(Buffer.from(content, "latin1"));
  const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
  const pages = add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  const imgRef = image ? " /XObject << /Im1 6 0 R >>" : "";
  const page = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >>${imgRef} >> /Contents 7 0 R >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const imgObj = image
    ? add({ dict: `<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.data.length} >>`, data: image.data })
    : add("<< >>");
  add({ dict: `<< /Length ${stream.length} /Filter /FlateDecode >>`, data: stream });

  // serialise, remembering where every object starts so the xref table is right
  const parts = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets = [0];
  let at = parts[0].length;
  objs.forEach((o, i) => {
    const n = i + 1;
    const head = Buffer.from(`${n} 0 obj\n` + (typeof o === "string" ? o : o.dict) + (typeof o === "string" ? "\nendobj\n" : "\nstream\n"), "latin1");
    offsets[n] = at;
    parts.push(head); at += head.length;
    if (typeof o !== "string") {
      parts.push(o.data); at += o.data.length;
      const tail = Buffer.from("\nendstream\nendobj\n", "latin1");
      parts.push(tail); at += tail.length;
    }
  });
  const startxref = at;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  xref += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
}

// Exported so qa-grownups.mjs can build a poster without a database.
export async function makePoster({ name, kidName, grownupName, color, coverUrl, link, host }) {
  const image = coverUrl ? await coverImage(coverUrl, host) : null;
  const credit = kidName ? ("A game by " + kidName + (grownupName ? " and " + grownupName : "")) : "Made on Buildable Kids";
  const qr = qrOps(link, A4.w - 56 - 150, 110, 150);
  return buildPdf({ title: name || "My game", credit, url: link, color: color || "#7C5CFC", image, qr });
}

export default async function handler(req, res) {
  const q = new URLSearchParams(String(req.url || "").split("?")[1] || "");
  const id = String(q.get("id") || "").trim();
  const familyId = String(q.get("familyId") || "").trim();
  res.setHeader("Cache-Control", "no-store");
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) return res.status(400).json({ ok: false, error: "id required" });
  if (!URL_ || !KEY) return res.status(503).json({ ok: false, error: "not configured" });
  try {
    const r = await rows(`kid_games?id=eq.${enc(id)}&deleted_at=is.null&select=id,name,kid_name,grownup_name,cover,manifest,family_id,shared,public&limit=1`);
    const g = r && r[0];
    if (!g) return res.status(404).json({ ok: false, error: "no game with that link" });
    const mine = familyId && g.family_id === familyId;
    if (!mine && !g.shared && !g.public) return res.status(403).json({ ok: false, error: "that game belongs to someone else" });
    // A poster IS a share. Rather than print a link that does not work, turn the
    // private link on for the family's own game and say so.
    let shared = g.shared;
    if (mine && !g.shared && !g.public) {
      await fetch(`${URL_}/rest/v1/kid_games?id=eq.${enc(id)}`, { method: "PATCH", headers: H, body: JSON.stringify({ shared: true, updated_at: new Date().toISOString() }) });
      shared = true;
    }
    const host = (req.headers && req.headers.host) ? ((req.headers["x-forwarded-proto"] || "https") + "://" + req.headers.host) : SITE;
    const pdf = await makePoster({ name: g.name, kidName: g.kid_name, grownupName: g.grownup_name,
      color: (g.manifest && g.manifest.color) || "#7C5CFC", coverUrl: g.cover,
      link: SITE.replace(/\/$/, "") + "/g/" + g.id, host });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="' + id + '-poster.pdf"');
    res.setHeader("X-Buildable-Shared", shared ? "1" : "0");
    return res.status(200).send(pdf);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
