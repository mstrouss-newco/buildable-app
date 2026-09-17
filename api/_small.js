// Shrinks a cached 1024px PNG into a small WebP for game use.
// A 2 MB PNG becomes roughly 30-120 KB. If sharp cannot load for any reason the
// caller gets null back and serves the original PNG, so art never breaks.
let _sharp;
async function getSharp() {
  if (_sharp !== undefined) return _sharp;
  try { _sharp = (await import("sharp")).default; } catch { _sharp = null; }
  return _sharp;
}
// Only these widths are allowed, so the edge cache holds a handful of copies, not hundreds.
export const SMALL_SIZES = [128, 256, 384, 512, 768];
export function smallWidth(q) {
  const n = parseInt((q && q.w) || "", 10);
  return SMALL_SIZES.includes(n) ? n : 0;
}
// base=true: crop away the empty border, then give back a thin strip of sky on top.
// For ground-standing pieces drawn small inside their frame, so the trunk still meets
// the ground and the piece fills its drawn height.
export async function toSmallWebp(b64, w, base) {
  const sharp = await getSharp();
  if (!sharp || !b64 || !w) return null;
  try {
    let src = Buffer.from(b64, "base64");
    if (base) {
      const t = await sharp(src).trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true });
      src = await sharp(t.data).extend({ top: Math.round(t.info.height * 0.06), background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    }
    return await sharp(src)
      .resize({ width: w, height: w, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90, effort: 4 })
      .toBuffer();
  } catch { return null; }
}
