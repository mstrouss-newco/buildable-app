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
@keyframes bk-fall { 0%{transform:translateY(-10%) translateX(0)} 100%{transform:translateY(110%) translateX(12px)} }
@keyframes bk-rain { 0%{transform:translateY(-20%)} 100%{transform:translateY(120%)} }
@keyframes bk-twinkle { 0%,100%{opacity:.2;transform:scale(.7)} 50%{opacity:1;transform:scale(1)} }
@keyframes bk-drift { 0%{transform:translateX(-12%)} 100%{transform:translateX(112%)} }
@keyframes bk-rise { 0%{transform:translateY(20%);opacity:0} 20%{opacity:.9} 100%{transform:translateY(-30%);opacity:0} }
@keyframes bk-pulse { 0%,100%{opacity:.25} 50%{opacity:.6} }
@keyframes bk-blink { 0%,92%,100%{transform:scaleY(1)} 96%{transform:scaleY(.1)} }
@keyframes bk-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
@keyframes bk-sway { 0%,100%{transform:rotate(-4deg)} 50%{transform:rotate(4deg)} }
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
          {seedNodes(26, (i) => (
            <span key={i} style={{
              position: "absolute", top: `${-10 + Math.random() * 10}%`, left: `${Math.random() * 100}%`,
              width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.9)",
              filter: "blur(0.4px)", animation: `bk-fall ${5 + Math.random() * 5}s linear ${Math.random() * 4}s infinite`,
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
              width: 2, height: 16, background: "linear-gradient(rgba(180,210,255,0),rgba(180,210,255,0.8))",
              animation: `bk-rain ${0.7 + Math.random() * 0.6}s linear ${Math.random() * 2}s infinite`,
            }} />
          ))}
        </div>
      );
    case "twinkling_stars":
      return (
        <div style={base} aria-hidden="true">
          {seedNodes(34, (i) => (
            <span key={i} style={{
              position: "absolute", top: `${Math.random() * 70}%`, left: `${Math.random() * 100}%`,
              width: 4, height: 4, borderRadius: "50%", background: "#fff",
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
          {seedNodes(4, (i) => (
            <span key={i} style={{
              position: "absolute", top: `${6 + i * 16}%`, left: 0,
              width: `${80 + Math.random() * 80}px`, height: `${28 + Math.random() * 20}px`,
              borderRadius: "999px", background: "rgba(255,255,255,0.5)", filter: "blur(6px)",
              animation: `bk-drift ${26 + i * 8}s linear ${i * 3}s infinite`,
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
            background: "radial-gradient(ellipse at 50% 92%, rgba(255,140,40,0.55), transparent 55%)",
            animation: "bk-flicker 1.4s ease-in-out infinite",
          }} />
        </div>
      );
    case "candle_glow":
      return (
        <div style={base} aria-hidden="true">
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(circle at 50% 60%, rgba(255,200,120,0.5), transparent 45%)",
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
    case "soft_glow":
    default:
      return (
        <div style={base} aria-hidden="true">
          <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 90px rgba(255,240,200,0.3)", animation: "bk-pulse 5s ease-in-out infinite" }} />
        </div>
      );
  }
}

// A friendly illustrated fallback "scene" for when AI page art hasn't arrived (or
// is off). It is NEVER blank: a world-tinted sky, simple layered scenery, and the
// hero (+ helper) shown as a big, gently-bobbing character so every page has life.
function PlaceholderScene({ palette, world, heroEmoji, helperEmoji }) {
  const [sky, ground] = palette && palette.length >= 2 ? palette : ["#3a2c63", "#7a4a86"];
  const night = ["outer_space", "snowy_forest", "cloud_castle"].indexOf(world) === -1 ? false : true;
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", overflow: "hidden",
      background: `linear-gradient(180deg, ${sky} 0%, ${ground} 100%)` }} aria-hidden="true">
      {/* sun or moon */}
      <div style={{ position: "absolute", top: "12%", right: "16%", width: 64, height: 64, borderRadius: "50%",
        background: night ? "radial-gradient(circle,#fdf6c4,#f2e89a)" : "radial-gradient(circle,#fff4c2,#ffd86b)",
        boxShadow: night ? "0 0 40px rgba(253,246,196,0.6)" : "0 0 50px rgba(255,216,107,0.7)" }} />
      {/* rolling ground / hills */}
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "42%" }}>
        <path d="M0 14 Q 25 4 50 12 T 100 10 L100 30 L0 30 Z" fill="rgba(0,0,0,0.18)" />
        <path d="M0 20 Q 30 12 60 18 T 100 16 L100 30 L0 30 Z" fill="rgba(0,0,0,0.28)" />
      </svg>
      {/* hero (and helper) characters */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "30%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 18 }}>
        <span style={{ fontSize: 88, filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.45))", animation: "bk-bob 3.4s ease-in-out infinite" }}>{heroEmoji || "🐰"}</span>
        {helperEmoji && <span style={{ fontSize: 52, filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.45))", animation: "bk-bob 3.4s ease-in-out 0.6s infinite" }}>{helperEmoji}</span>}
      </div>
    </div>
  );
}

// The full living page: art (or placeholder) + ambient effect overlay.
export function LivingPage({ artUrl, effect, palette, world, heroEmoji, helperEmoji, children, style }) {
  useEffect(() => { injectKeyframes(); }, []);
  return (
    <div style={{ position: "relative", overflow: "hidden", ...style }}>
      {artUrl
        ? <img src={artUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
        : <PlaceholderScene palette={palette} world={world} heroEmoji={heroEmoji} helperEmoji={helperEmoji} />}
      <LivingLayer effect={effect} />
      {children}
    </div>
  );
}

export default LivingPage;
