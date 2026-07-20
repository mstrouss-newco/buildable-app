// /src/lib/storyEffects.jsx
// Living-page effect system for Buildable Stories.
//
// SAFETY: the AI story generator may ONLY choose an effect by id from
// STORY_EFFECTS below. It never emits code. This renderer maps a known id to a
// fixed, hand-written CSS/SVG animation. Unknown ids fall back to "soft_glow".
//
// Each effect is a small set of absolutely-positioned, GPU-cheap animated nodes
// layered over the page art. Add a new effect by: (1) adding its id here,
// (2) adding a case in <LivingLayer>, (3) allow-listing it in api/generate-story.js.
import { useEffect } from "react";

export const STORY_EFFECTS = [
  "fireplace_flicker",
  "snow_outside_window",
  "twinkling_stars",
  "candle_glow",
  "gentle_rain",
  "drifting_clouds",
  "magic_sparkles",
  "character_blink",
  "soft_glow",
  "floating_dust",
  "sun_pulse",
  "water_shimmer",
  "gentle_waves",
  "bubbles",
  "embers",
  "fireflies",
  "falling_leaves",
  "shooting_stars",
  "falling_petals",
];

const EFFECT_SET = new Set(STORY_EFFECTS);
export function normalizeEffect(id) {
  return EFFECT_SET.has(id) ? id : "soft_glow";
}

// Inject the keyframes once per document.
let injected = false;
function injectKeyframes() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const css = `
@keyframes bk-flicker { 0%,100%{opacity:.55;transform:scale(1)} 45%{opacity:.95;transform:scale(1.06)} 70%{opacity:.7;transform:scale(.98)} }
@keyframes bk-bloom { 0%,100%{opacity:.30} 22%{opacity:.56} 44%{opacity:.36} 63%{opacity:.62} 82%{opacity:.44} }
@keyframes bk-firefly { 0%{transform:translate(0,0);opacity:.2} 25%{opacity:1} 50%{transform:translate(14px,-12px);opacity:.5} 75%{opacity:.95} 100%{transform:translate(-8px,-22px);opacity:.2} }
@keyframes bk-leaf { 0%{transform:translateY(-12%) translateX(0) rotate(0)} 50%{transform:translateY(50%) translateX(22px) rotate(180deg)} 100%{transform:translateY(115%) translateX(-12px) rotate(360deg)} }
@keyframes bk-bubble { 0%{transform:translateY(15%) translateX(0) scale(.6);opacity:0} 15%{opacity:.75} 50%{transform:translateY(-45%) translateX(10px) scale(.9)} 100%{transform:translateY(-115%) translateX(-6px) scale(1);opacity:0} }
@keyframes bk-shoot { 0%{opacity:0;transform:translate(0,0) rotate(150deg)} 4%{opacity:1} 18%{opacity:0;transform:translate(-240px,150px) rotate(150deg)} 100%{opacity:0;transform:translate(-240px,150px) rotate(150deg)} }
@keyframes bk-fall { 0%{transform:translateY(-10%) translateX(0)} 100%{transform:translateY(110%) translateX(12px)} }
@keyframes bk-rain { 0%{transform:translateY(-20%)} 100%{transform:translateY(120%)} }
@keyframes bk-twinkle { 0%,100%{opacity:.2;transform:scale(.7)} 50%{opacity:1;transform:scale(1)} }
@keyframes bk-drift { 0%{transform:translateX(-12%)} 100%{transform:translateX(112%)} }
@keyframes bk-rise { 0%{transform:translateY(20%);opacity:0} 20%{opacity:.9} 100%{transform:translateY(-30%);opacity:0} }
@keyframes bk-pulse { 0%,100%{opacity:.25} 50%{opacity:.6} }
@keyframes bk-blink { 0%,92%,100%{transform:scaleY(1)} 96%{transform:scaleY(.1)} }
@keyframes bk-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
@keyframes bk-sway { 0%,100%{transform:rotate(-4deg)} 50%{transform:rotate(4deg)} }
@keyframes bk-cfloat { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-3.2%) scale(1.012)} }
@keyframes bk-csway { 0%,100%{transform:translateY(0) rotate(-1.6deg)} 50%{transform:translateY(-2.4%) rotate(1.6deg)} }
@keyframes bk-cbob { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-2%) scale(1.025)} }
@keyframes bk-charfloat { 0%,100%{transform:translateX(-50%) translateY(0) scale(1)} 50%{transform:translateX(-50%) translateY(-14px) scale(1.012)} }
@keyframes bk-parallax { 0%,100%{transform:translateX(-4px)} 50%{transform:translateX(4px)} }
@keyframes bk-sweep { 0%{background-position:200% 0} 100%{background-position:-120% 0} }
@keyframes bk-kenburns { 0%{transform:scale(1.05) translate(0%,0%)} 100%{transform:scale(1.20) translate(-2.5%,-1.5%)} }
@keyframes bk-scene-in { 0%{opacity:0} 100%{opacity:1} }
@keyframes bk-flow { 0%{background-position:0 0} 100%{background-position:220% 0} }
@keyframes bk-sunpulse { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:.85;transform:scale(1.12)} }
@keyframes bk-shimmer { 0%,100%{opacity:.15;transform:translateX(0)} 50%{opacity:.7;transform:translateX(6px)} }
@keyframes bk-wave { 0%,100%{transform:translateX(-8px)} 50%{transform:translateX(8px)} }
@keyframes bk-sparkle { 0%{opacity:0;transform:scale(.4) rotate(0)} 50%{opacity:1;transform:scale(1) rotate(45deg)} 100%{opacity:0;transform:scale(.4) rotate(90deg)} }
`;
  const el = document.createElement("style");
  el.setAttribute("data-bk-story-effects", "");
  el.textContent = css;
  document.head.appendChild(el);
}

function seedNodes(n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn(i));
  return out;
}

// The ambient animation layer for one effect id. Pointer-events off so it never
// blocks taps. prefers-reduced-motion users get a calm static version (no nodes).
function LivingLayer({ effect }) {
  const id = normalizeEffect(effect);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const base = { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", borderRadius: "inherit" };

  if (reduce) {
    return <div style={{ ...base, boxShadow: "inset 0 0 80px rgba(255,240,200,0.25)" }} />;
  }

  switch (id) {
    case "snow_outside_window":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(46, (i) => (
            <span key={i} style={{
              position: "absolute", top: `${-10 + Math.random() * 10}%`, left: `${Math.random() * 100}%`,
              width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.95)",
              filter: "blur(0.3px)", animation: `bk-fall ${4 + Math.random() * 4}s linear ${Math.random() * 4}s infinite`,
            }} />
          ))}
        </div>
      );
    case "gentle_rain":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(30, (i) => (
            <span key={i} style={{
              position: "absolute", top: `${-20 + Math.random() * 10}%`, left: `${Math.random() * 100}%`,
              width: 2, height: 16, background: "linear-gradient(rgba(180,210,255,0),rgba(180,210,255,0.45))",
              animation: `bk-rain ${0.7 + Math.random() * 0.6}s linear ${Math.random() * 2}s infinite`,
            }} />
          ))}
        </div>
      );
    case "twinkling_stars":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(46, (i) => (
            <span key={i} style={{
              position: "absolute", top: `${Math.random() * 70}%`, left: `${Math.random() * 100}%`,
              width: 5, height: 5, borderRadius: "50%", background: "#fff",
              boxShadow: "0 0 6px rgba(255,255,255,0.9)",
              animation: `bk-twinkle ${1.5 + Math.random() * 2.5}s ease-in-out ${Math.random() * 3}s infinite`,
            }} />
          ))}
        </div>
      );
    case "magic_sparkles":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(20, (i) => (
            <span key={i} style={{
              position: "absolute", top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`,
              width: 10, height: 10, background: "radial-gradient(circle, #fff 0%, #ffe08a 40%, transparent 70%)",
              animation: `bk-sparkle ${1.6 + Math.random() * 1.8}s ease-in-out ${Math.random() * 3}s infinite`,
            }} />
          ))}
        </div>
      );
    case "drifting_clouds":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(3, (i) => (
            <span key={i} style={{
              position: "absolute", top: `${6 + i * 9}%`, left: "-25%",
              width: `${120 + Math.random() * 70}px`, height: `${26 + Math.random() * 14}px`,
              borderRadius: "999px", background: "rgba(255,255,255,0.16)", filter: "blur(11px)",
              animation: `bk-drift ${28 + i * 7}s linear ${i * 6}s infinite`,
            }} />
          ))}
        </div>
      );
    case "floating_dust":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(18, (i) => (
            <span key={i} style={{
              position: "absolute", bottom: `-5%`, left: `${Math.random() * 100}%`,
              width: 4, height: 4, borderRadius: "50%", background: "rgba(255,238,180,0.7)",
              animation: `bk-rise ${7 + Math.random() * 6}s ease-in ${Math.random() * 5}s infinite`,
            }} />
          ))}
        </div>
      );
    case "fireplace_flicker":
      return (
        <div style={base} aria-hidden="true">
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at 50% 92%, rgba(255,140,40,0.35), transparent 55%)",
            animation: "bk-flicker 1.4s ease-in-out infinite",
          }} />
        </div>
      );
    case "candle_glow":
      return (
        <div style={base} aria-hidden="true">
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(circle at 50% 60%, rgba(255,200,120,0.32), transparent 45%)",
            animation: "bk-flicker 2.2s ease-in-out infinite",
          }} />
        </div>
      );
    case "character_blink":
      // A soft eye-level shimmer (true per-character blink needs art anchors; this
      // is the safe MVP cue). Upgraded later when art returns face coordinates.
      return (
        <div style={base} aria-hidden="true">
          <div style={{
            position: "absolute", left: "42%", top: "40%", width: "16%", height: "6%",
            background: "rgba(255,255,255,0.18)", borderRadius: "999px",
            animation: "bk-blink 4.5s ease-in-out infinite",
          }} />
        </div>
      );
    case "sun_pulse":
      // Warm glow that breathes — sun/moon usually sits in the upper area.
      return (
        <div style={base} aria-hidden="true">
          <div style={{ position: "absolute", top: "4%", left: "8%", right: "8%", height: "44%",
            background: "radial-gradient(circle at 50% 30%, rgba(255,220,130,0.38), transparent 60%)",
            animation: "bk-sunpulse 3.6s ease-in-out infinite" }} />
        </div>
      );
    case "water_shimmer":
    case "gentle_waves":
      // Water overlay removed — it covered too much of the scene. Reef/water pages
      // still get bubbles (per-world ambience) + the water SOUND.
      return <div style={base} aria-hidden="true" />;
    case "bubbles":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(22, (i) => { const sz = 6 + Math.random() * 14; return (
            <span key={i} style={{
              position: "absolute", bottom: "-8%", left: `${Math.random() * 100}%`, width: sz, height: sz, borderRadius: "50%",
              background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.7), rgba(200,235,255,0.15) 60%, transparent 72%)",
              border: "1px solid rgba(255,255,255,0.3)",
              animation: `bk-bubble ${5 + Math.random() * 5}s linear ${Math.random() * 5}s infinite`,
            }} />); })}
        </div>
      );
    case "embers":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(20, (i) => (
            <span key={i} style={{
              position: "absolute", bottom: "-5%", left: `${Math.random() * 100}%`, width: 4, height: 4, borderRadius: "50%",
              background: "rgba(255,150,60,0.9)", boxShadow: "0 0 6px rgba(255,120,40,0.85)",
              animation: `bk-rise ${4 + Math.random() * 4}s ease-in ${Math.random() * 4}s infinite`,
            }} />
          ))}
        </div>
      );
    case "fireflies":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(24, (i) => (
            <span key={i} style={{
              position: "absolute", top: `${18 + Math.random() * 62}%`, left: `${Math.random() * 100}%`, width: 5, height: 5, borderRadius: "50%",
              background: "rgba(255,244,150,0.95)", boxShadow: "0 0 8px 2px rgba(255,230,120,0.8)",
              animation: `bk-firefly ${3.5 + Math.random() * 3.5}s ease-in-out ${Math.random() * 4}s infinite`,
            }} />
          ))}
        </div>
      );
    case "falling_leaves":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(18, (i) => { const green = Math.random() < 0.5; return (
            <span key={i} style={{
              position: "absolute", top: "-10%", left: `${Math.random() * 100}%`, width: 11, height: 8, borderRadius: "0 60% 0 60%",
              background: green ? "rgba(120,170,70,0.85)" : "rgba(210,150,60,0.85)",
              animation: `bk-leaf ${6 + Math.random() * 5}s linear ${Math.random() * 5}s infinite`,
            }} />); })}
        </div>
      );
    case "shooting_stars":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(30, (i) => (
            <span key={"t" + i} style={{
              position: "absolute", top: `${Math.random() * 70}%`, left: `${Math.random() * 100}%`, width: 4, height: 4, borderRadius: "50%",
              background: "#fff", boxShadow: "0 0 6px rgba(255,255,255,0.9)",
              animation: `bk-twinkle ${1.5 + Math.random() * 2.5}s ease-in-out ${Math.random() * 3}s infinite`,
            }} />
          ))}
          {seedNodes(3, (i) => (
            <span key={"s" + i} style={{
              position: "absolute", top: `${5 + Math.random() * 38}%`, left: `${52 + Math.random() * 42}%`, width: 86, height: 2, borderRadius: 2,
              background: "linear-gradient(90deg, rgba(255,255,255,0), #fff)", boxShadow: "0 0 8px rgba(255,255,255,0.9)",
              animation: `bk-shoot ${7 + i * 4}s ease-in ${2.5 + i * 3}s infinite`,
            }} />
          ))}
        </div>
      );
    case "falling_petals":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(16, (i) => { const pink = Math.random() < 0.6; return (
            <span key={i} style={{
              position: "absolute", top: "-10%", left: `${Math.random() * 100}%`, width: 10, height: 7, borderRadius: "60% 0 60% 0",
              background: pink ? "rgba(255,180,200,0.9)" : "rgba(255,235,245,0.92)",
              animation: `bk-leaf ${6 + Math.random() * 5}s linear ${Math.random() * 5}s infinite`,
            }} />); })}
        </div>
      );
    case "soft_glow":
    default:
      return (
        <div style={base} aria-hidden="true">
          <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 90px rgba(255,240,200,0.3)", animation: "bk-pulse 5s ease-in-out infinite" }} />
        </div>
      );
  }
}

// A friendly illustrated fallback "scene". NEVER blank and VARIES per page: the
// sky hue rotates by page number, the sun/moon + extra scenery are chosen from the
// page's ambient effect, and the hero (+ helper) appear as big bobbing characters.
function hexToHsl(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return [260, 40, 35];
  let r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, sR = 0, l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; sR = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, sR * 100, l * 100];
}
function hsl(h, sP, l) { return `hsl(${((h % 360) + 360) % 360}, ${Math.max(0, Math.min(100, sP))}%, ${Math.max(0, Math.min(100, l))}%)`; }

const NIGHT_EFFECTS = new Set(["twinkling_stars", "candle_glow", "fireplace_flicker", "magic_sparkles"]);

// A soft DRAWN creature silhouette used as the loading placeholder hero.
// No emoji anywhere in the product (product law) — pure SVG geometry.
function CreatureBlob({ size = 100, tone = "#caa6ff", delay = 0 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true"
      style={{ filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.4))", animation: `bk-bob 3.4s ease-in-out ${delay}s infinite` }}>
      <ellipse cx="34" cy="22" rx="9" ry="16" fill={tone} />
      <ellipse cx="66" cy="22" rx="9" ry="16" fill={tone} />
      <ellipse cx="50" cy="60" rx="30" ry="34" fill={tone} />
      <ellipse cx="50" cy="68" rx="18" ry="22" fill="rgba(255,255,255,0.32)" />
      <circle cx="41" cy="52" r="3.6" fill="#2a2140" />
      <circle cx="59" cy="52" r="3.6" fill="#2a2140" />
      <path d="M44 63 Q50 69 56 63" stroke="#2a2140" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function PlaceholderScene({ palette, world, heroEmoji, helperEmoji, effect, pageIndex = 0 }) {
  const [skyHex, groundHex] = palette && palette.length >= 2 ? palette : ["#3a2c63", "#7a4a86"];
  const [h0, s0, l0] = hexToHsl(skyHex);
  const [h1, s1, l1] = hexToHsl(groundHex);
  const shift = pageIndex * 16;                 // each page gets its own hue
  const night = NIGHT_EFFECTS.has(effect);
  const lift = night ? -8 : 8;                  // night a touch darker, day lighter
  const skyTop = hsl(h0 + shift, s0, l0 + lift);
  const skyBot = hsl(h1 + shift, s1, l1 + lift + 6);
  const celestialSun = !night;
  const isForest = world === "enchanted-forest" || world === "dino-jungle" || world === "snowy-village";
  const isUnderwater = world === "coral-reef";
  const showClouds = effect === "drifting_clouds" || world === "candy-land" || world === "city-town";

  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", overflow: "hidden",
      background: `linear-gradient(180deg, ${skyTop} 0%, ${skyBot} 100%)` }} aria-hidden="true">
      {/* sun or moon (position shifts per page) */}
      <div style={{ position: "absolute", top: `${10 + (pageIndex % 3) * 6}%`, [pageIndex % 2 ? "left" : "right"]: "16%",
        width: 60, height: 60, borderRadius: "50%",
        background: celestialSun ? "radial-gradient(circle,#fff4c2,#ffd86b)" : "radial-gradient(circle,#fdf6c4,#e9e09a)",
        boxShadow: celestialSun ? "0 0 50px rgba(255,216,107,0.7)" : "0 0 40px rgba(253,246,196,0.55)" }} />
      {showClouds && [0, 1, 2].map((i) => (
        <div key={i} style={{ position: "absolute", top: `${14 + i * 12}%`, left: `${(i * 33 + pageIndex * 12) % 80}%`,
          width: 90, height: 30, borderRadius: 999, background: "rgba(255,255,255,0.45)", filter: "blur(5px)" }} />
      ))}
      {/* rolling ground / hills */}
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "42%" }}>
        <path d="M0 14 Q 25 4 50 12 T 100 10 L100 30 L0 30 Z" fill="rgba(0,0,0,0.18)" />
        <path d="M0 20 Q 30 12 60 18 T 100 16 L100 30 L0 30 Z" fill="rgba(0,0,0,0.30)" />
      </svg>
      {isForest && [16, 76, 90].map((x, i) => (
        <svg key={i} viewBox="0 0 40 56" width={38 + (i % 2) * 10} style={{ position: "absolute", bottom: "26%", left: `${x}%`, filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.4))" }} aria-hidden="true">
          <polygon points="20,2 34,24 6,24" fill="#2f6b43" />
          <polygon points="20,14 36,40 4,40" fill="#357a4c" />
          <rect x="17" y="40" width="6" height="12" rx="2" fill="#6b4a2a" />
        </svg>
      ))}
      {isUnderwater && [0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ position: "absolute", bottom: `${10 + (i * 13) % 50}%`, left: `${(i * 21 + pageIndex * 9) % 90}%`,
          width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.35)" }} />
      ))}
      {/* hero (and helper) — soft DRAWN silhouettes (no emoji, per product law) */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "30%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 18 }}>
        <CreatureBlob size={112} tone={groundHex} />
        {helperEmoji && <CreatureBlob size={64} tone={skyHex} delay={0.6} />}
      </div>
    </div>
  );
}

// The full living page: art (or placeholder) + ambient effect overlay.
export function LivingPage({ artUrl, effect, effects, palette, world, heroEmoji, helperEmoji, pageIndex, children, style }) {
  const layers = Array.isArray(effects) && effects.length ? effects.slice(0, 3) : [effect];
  useEffect(() => { injectKeyframes(); }, []);
  const ORIGINS = ["50% 45%", "25% 35%", "75% 35%", "30% 70%", "70% 65%", "50% 25%"];
  const origin = ORIGINS[(pageIndex || 0) % ORIGINS.length];
  return (
    <div style={{ position: "relative", overflow: "hidden", ...style }}>
      {artUrl
        ? <img src={artUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit", transformOrigin: origin, animation: "bk-kenburns 18s ease-in-out infinite alternate" }} />
        : <PlaceholderScene palette={palette} world={world} heroEmoji={heroEmoji} helperEmoji={helperEmoji} effect={effect} pageIndex={pageIndex} />}
      {layers.map((e, i) => <LivingLayer key={i + ":" + e} effect={e} />)}
      {children}
    </div>
  );
}

const FG_BY_WORLD = {
  "snowy-village": "snow_outside_window",
  "coral-reef": "bubbles",
  "enchanted-forest": "fireflies",
  "dragon-mountain": "embers",
  "dino-jungle": "falling_leaves",
  "space-station": "shooting_stars",
  "desert-oasis": "sun_pulse",
  "candy-land": "magic_sparkles",
};

// Each character has a natural on-page size so a bear isn't the same size as a
// hedgehog. 1.0 = the baseline; tune per critter.
const CHAR_SCALE = {
  bunny:0.86, fox:0.92, bear:1.18, penguin:0.84, dragon:1.12, owl:0.82,
  turtle:0.80, hedgehog:0.74, koala:0.94, tiger:1.10, fawn:1.00, otter:0.88,
  wizard:1.00, fairy:0.78, robot:0.86, mermaid:0.96,
};
// Six placements the character cycles through across pages, so it never sits in
// the same spot/size twice in a row — position, facing (flip), size nudge, motion.
const PLACEMENTS = [
  { x:50, s:1.00, flip:1,  b:0, anim:"bk-cfloat" },
  { x:71, s:0.90, flip:-1, b:3, anim:"bk-csway"  },
  { x:30, s:0.96, flip:1,  b:1, anim:"bk-cbob"   },
  { x:62, s:0.86, flip:-1, b:5, anim:"bk-cfloat" },
  { x:37, s:1.05, flip:1,  b:0, anim:"bk-csway"  },
  { x:50, s:0.92, flip:1,  b:2, anim:"bk-cbob"   },
];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function placeChar(pageIndex, charSlug) {
  const p = PLACEMENTS[(pageIndex || 0) % PLACEMENTS.length];
  const natural = CHAR_SCALE[charSlug] != null ? CHAR_SCALE[charSlug] : 1;
  const width = clamp(30 * natural * p.s, 15, 38); // % of stage width
  return { leftPct: p.x, bottomPct: p.b, widthPct: width, flip: p.flip, anim: p.anim, delay: ((pageIndex || 0) % 4) * 0.4 };
}

export function LayeredPage({ bgUrl, charUrl, charSlug, effect, effects, palette, world, heroEmoji, helperEmoji, pageIndex, children, style }) {
  useEffect(() => { injectKeyframes(); }, []);
  const layers = Array.isArray(effects) && effects.length ? effects.slice(0, 3) : [effect];
  const origin = ["50% 45%", "30% 40%", "70% 40%"][(pageIndex || 0) % 3];
  return (
    <div style={{ position: "relative", overflow: "hidden", ...style }}>
      {bgUrl
        ? <img src={bgUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit", transformOrigin: origin, animation: "bk-kenburns 20s ease-in-out infinite alternate" }} />
        : <PlaceholderScene palette={palette} world={world} heroEmoji={heroEmoji} helperEmoji={helperEmoji} effect={effect} pageIndex={pageIndex} />}
      {charUrl && (() => {
        const pc = placeChar(pageIndex, charSlug);
        return (
          <div style={{ position: "absolute", left: pc.leftPct + "%", bottom: pc.bottomPct + "%", width: pc.widthPct + "%", transform: `translateX(-50%) scaleX(${pc.flip})`, transformOrigin: "50% 100%" }}>
            <img src={charUrl} alt="" style={{ width: "100%", display: "block", filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.4))", transformOrigin: "50% 100%", animation: `${pc.anim} 4.6s ease-in-out ${pc.delay}s infinite` }} />
          </div>
        );
      })()}
      {layers.map((e, i) => <LivingLayer key={i + ":" + e} effect={e} />)}
      {/* foreground moving things (in front of the character) */}
      <LivingLayer effect={FG_BY_WORLD[world] || "floating_dust"} />
      {children}
    </div>
  );
}

export function SceneStage({ url, effect, effects, world, pageIndex, style, waterMask, children }) {
  useEffect(() => { injectKeyframes(); }, []);
  const layers = Array.isArray(effects) && effects.length ? effects.slice(0, 2) : [effect];
  const origin = ["50% 45%", "30% 40%", "70% 40%"][(pageIndex || 0) % 3];
  const GLOW_FX = new Set(["fireplace_flicker", "candle_glow", "magic_sparkles", "sun_pulse", "soft_glow", "twinkling_stars"]);
  const glow = layers.some((e) => GLOW_FX.has(e)) || GLOW_FX.has(FG_BY_WORLD[world]);
  return (
    <div style={{ position: "relative", overflow: "hidden", ...style }}>
      <img src={url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit", transformOrigin: origin, animation: "bk-scene-in 0.6s ease both, bk-kenburns 22s ease-in-out infinite alternate" }} />
      {glow && <img src={url} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit", transformOrigin: origin, filter: "blur(7px) brightness(1.55) saturate(1.15)", mixBlendMode: "screen", opacity: 0.42, animation: "bk-kenburns 22s ease-in-out infinite alternate, bk-bloom 3.4s ease-in-out infinite", pointerEvents: "none" }} />}
      {glow && <div aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "inherit", background: "radial-gradient(65% 55% at 50% 58%, rgba(255,184,92,0.16), transparent 72%)", mixBlendMode: "screen", animation: "bk-bloom 2.6s ease-in-out infinite", pointerEvents: "none" }} />}
      {layers.map((e, i) => <LivingLayer key={i + ":" + e} effect={e} />)}
      <LivingLayer effect={FG_BY_WORLD[world] || "floating_dust"} />
      {children}
    </div>
  );
}

export default LivingPage;
