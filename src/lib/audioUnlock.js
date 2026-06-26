// Shared audio unlock for iOS/iPad. Safari only lets audio start from a real
// user gesture, so on the FIRST tap/key we (1) resume a shared AudioContext and
// play a silent buffer, and (2) "prime" every <audio>/<video> element (and any
// registered Audio() objects) with a silent blip so later programmatic play()
// is allowed. Install once at app start.
const SILENT = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
let ctx = null, installed = false;
const primed = new WeakSet();
const reg = new Set();

export function getAudioCtx() {
  if (!ctx) { try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); } catch {} }
  return ctx;
}
export function registerAudio(el) { if (el) reg.add(el); }

function primeEl(el) {
  if (!el || primed.has(el)) return;
  if (el.currentSrc && !el.paused) return;            // don't disturb audio that's already playing
  try {
    const hadSrc = !!el.getAttribute("src");
    if (!hadSrc) el.src = SILENT;
    el.muted = true;
    const restore = () => { try { el.pause(); el.currentTime = 0; } catch {} el.muted = false; if (!hadSrc) { try { el.removeAttribute("src"); el.load && el.load(); } catch {} } };
    const p = el.play();
    if (p && p.then) p.then(() => { primed.add(el); restore(); }).catch(() => { restore(); });
    else { primed.add(el); restore(); }
  } catch {}
}
function primeAll() { try { document.querySelectorAll("audio,video").forEach(primeEl); } catch {} reg.forEach(primeEl); }

export function unlockNow() {
  const c = getAudioCtx();
  try { if (c && c.state === "suspended") c.resume(); } catch {}
  try { if (c) { const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } } catch {}
  primeAll();
}
export function installAudioUnlock() {
  if (installed || typeof window === "undefined") return; installed = true;
  const h = () => unlockNow();
  ["pointerdown", "touchend", "mousedown", "keydown"].forEach((ev) => window.addEventListener(ev, h, { passive: true, capture: true }));
}
