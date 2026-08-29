// /src/BottomBar.jsx
// ==================================================================
// GN2 — the NV1 five-tab bottom bar, lifted out of the shell so more than one
// module can show it.
//
// It began life inside src/BuildableKids.jsx, which was fine while only the
// shell's own section pages rendered it. The multiplayer lobby (src/GameLobby.jsx)
// is its own module, and having it import back into BuildableKids.jsx would make
// an import cycle -- so the bar, its glyphs, its colours and the one
// bar-clearance number now live here and everybody imports them from one place.
//
// WHAT LIVES HERE (and nothing else): the bar itself, the four drawn glyphs, the
// five tab colours, the kid-avatar helpers for the Me tab, and navBarClear() --
// the single number every screen that shows the bar uses to keep its content and
// its floating controls out of the bar strip. See HUD-AND-NAV-RULES.md Rule 0.
// ==================================================================
import { useState, useEffect } from "react";

// Mirrored from src/BuildableKids.jsx (same rule the --bk-nav-* numbers follow in
// HUD-AND-NAV-RULES.md: move one and you must move the other). Two font stacks is
// a cheaper duplication than a shared module nothing else would ever import.
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ---------------------------------------------------------------------------
// GN1 — how much room the NV1 five-tab bottom bar takes at the foot of a screen.
// The bar is position:fixed and already carries env(safe-area-inset-bottom), so
// anything ELSE pinned to the bottom of a screen that also shows the bar has to
// clear the same distance or it sits in the bar strip. One number, one helper:
// move NAV_BAR_H and every screen's padding and every floating pill move with it.
//
//   navBarClear()    the top of the bar, in the page's own coordinate space
//   navBarClear(14)  the same, plus the gap a floating pill normally keeps
//
// Keep this in step with the BottomBar <nav> style further down: 8px + 8px of bar
// padding around a ~60px tab pill (28px glyph + 3px gap + label, 8/6 pad) = 76.
// ---------------------------------------------------------------------------
export const NAV_BAR_H = 76;
export const navBarClear = (extra = 0) => `calc(env(safe-area-inset-bottom, 0px) + ${NAV_BAR_H + extra}px)`;

// ---------------------------------------------------------------------------
// NV1 — the always-visible 5-tab bottom bar (Home / Play / Make / Explore / Me).
// Set A chunky solid-shape glyphs in Set C brand colours. Resting: coloured glyph
// on a soft tint of its own colour (NEVER grey). Selected: solid colour pill,
// glyph flips white. Word always under the icon. Me uses the kid's own initial +
// gradient avatar so switching player on a shared tablet is obvious.
// NV1 wires ONLY Home + Play as dedicated pages. Make / Explore / Me route to
// their closest existing destination until NV3 ships the dedicated pages —
// bar stays present and honest either way.
// ---------------------------------------------------------------------------
export const NAV_TAB_COLORS = { home: "#F0972A", play: "#2FB7D6", make: "#E0578F", explore: "#2E7D4F", me: "#6A4FE0" };
const NAV_AVATAR_GRADS = [
  "linear-gradient(160deg,#8A6BFF,#6A4FE0)",
  "linear-gradient(160deg,#F2789E,#E0578F)",
  "linear-gradient(160deg,#4FA6E8,#2F8FD6)",
  "linear-gradient(160deg,#3DD06A,#2BB14F)",
  "linear-gradient(160deg,#FFC75A,#F0972A)",
  "linear-gradient(160deg,#46D7C0,#1FA897)",
];
function navPillGrad(name) {
  let h = 0; const s = name || "?";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return NAV_AVATAR_GRADS[h % NAV_AVATAR_GRADS.length];
}
function navInitial(name) { const n = (name || "").trim(); return n ? n[0].toUpperCase() : "?"; }
// Chunky solid-shape glyphs — one filled path each so "flip to white" is one
// colour swap and never fights an inner stroke.
const NavHomeGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L21 11 L21 20 A1 1 0 0 1 20 21 L14.5 21 L14.5 14.5 L9.5 14.5 L9.5 21 L4 21 A1 1 0 0 1 3 20 L3 11 Z" fill="currentColor" /></svg>
);
// Play = a GAME CONTROLLER, not a play triangle. Body + d-pad + two buttons in
// ONE evenodd path, so the cut-outs are holes and "flip to white" stays a single
// colour swap.
const NavPlayGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M7.25 7.25 H16.75 A5.375 5.375 0 0 1 16.75 18 H7.25 A5.375 5.375 0 0 1 7.25 7.25 Z M6.85 10.55 H8.75 V11.8 H10 V13.7 H8.75 V14.95 H6.85 V13.7 H5.6 V11.8 H6.85 Z M15.25 11.6 A1.15 1.15 0 1 0 17.55 11.6 A1.15 1.15 0 1 0 15.25 11.6 Z M17.45 13.9 A1.15 1.15 0 1 0 19.75 13.9 A1.15 1.15 0 1 0 17.45 13.9 Z" /></svg>
);
// Make = a PAINT PALETTE, not a sparkle. Blob outline with the thumb notch, and
// four paint wells as evenodd holes.
const NavMakeGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M12 2.6c-5.2 0-9.4 4.2-9.4 9.4s4.2 9.4 9.4 9.4c1.1 0 1.9-.8 1.9-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1c3.1 0 5.6-2.5 5.6-5.6 0-4.6-4.6-7.2-10.4-7.2z M5.7 12.2 A1.5 1.5 0 1 0 8.7 12.2 A1.5 1.5 0 1 0 5.7 12.2 Z M8.1 7.7 A1.5 1.5 0 1 0 11.1 7.7 A1.5 1.5 0 1 0 8.1 7.7 Z M13.1 7.2 A1.5 1.5 0 1 0 16.1 7.2 A1.5 1.5 0 1 0 13.1 7.2 Z M16.5 10.4 A1.4 1.4 0 1 0 19.3 10.4 A1.4 1.4 0 1 0 16.5 10.4 Z" /></svg>
);
// Explore = an OPEN BOOK, not a gem. Two page shapes with a gap between them
// that reads as the spine.
const NavExploreGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11.1 6.9C9.4 5.5 7 4.8 4 4.8c-.7 0-1.2.5-1.2 1.2v11.3c0 .7.5 1.2 1.2 1.2 2.9 0 5 .5 6.4 1.5.3.2.7 0 .7-.4z M12.9 6.9c1.7-1.4 4.1-2.1 7.1-2.1.7 0 1.2.5 1.2 1.2v11.3c0 .7-.5 1.2-1.2 1.2-2.9 0-5 .5-6.4 1.5-.3.2-.7 0-.7-.4z" /></svg>
);
export default function BottomBar({ current, activeKid, onHome, onPlay, onMake, onExplore, onMe }) {
  const kidName = activeKid && activeKid.display_name;
  const kidGrad = navPillGrad(kidName);
  const kidInit = navInitial(kidName);
  const TABS = [
    { id: "home", label: "Home", on: onHome, glyph: <NavHomeGlyph /> },
    { id: "play", label: "Play", on: onPlay, glyph: <NavPlayGlyph /> },
    { id: "make", label: "Make", on: onMake, glyph: <NavMakeGlyph /> },
    { id: "explore", label: "Explore", on: onExplore, glyph: <NavExploreGlyph /> },
    { id: "me", label: "Me", on: onMe, glyph: null },
  ];
  // NV4 — every tab press gets the same juice every game gets: a "select" tap
  // sound + a light haptic through the shared Feel Kit, and a brief squash on
  // the pressed pill so the tap has a visual pulse to match the sound. The
  // squash is state-driven (not just :active) so it survives touch->click on
  // iOS and works the same on a mouse. Feel is a safe no-op when the Kit is
  // not loaded, so headless QA and cold offline hits never crash.
  const [pressed, setPressed] = useState(null);
  // GN2 — while the bar is on screen it publishes its own height on <html> as
  // --bk-bottom-bar. Anything else pinned to the bottom of the page (the buddy
  // toast in HelperReactions) reads that variable and raises itself clear, and
  // falls back to 0px on every screen with no bar. This is the same trick the
  // in-game HUD uses with --bk-nav-* (HUD-AND-NAV-RULES.md), and it means a
  // floating element never has to know which screen it is on.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--bk-bottom-bar", navBarClear(0));
    return () => root.style.removeProperty("--bk-bottom-bar");
  }, []);
  const pressTab = (t) => {
    setPressed(t.id);
    try { window.BuildableFeel && window.BuildableFeel.tap(); } catch (e) {}
    setTimeout(() => setPressed((p) => (p === t.id ? null : p)), 140);
    if (t.on) t.on();
  };
  return (
    <nav data-nv1-bottom-bar aria-label="Sections" style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 3200,
      display: "flex", justifyContent: "space-around", alignItems: "stretch", gap: 4,
      padding: "8px 8px calc(env(safe-area-inset-bottom, 0px) + 8px)",
      background: "rgba(255,248,238,0.96)", backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)", borderTop: "1px solid rgba(58,46,77,0.10)",
      boxShadow: "0 -6px 18px rgba(58,46,77,0.08)", fontFamily: NUN,
    }}>
      {TABS.map((t) => {
        const color = NAV_TAB_COLORS[t.id];
        const sel = current === t.id;
        const bg = sel ? color : color + "26"; // ~15% alpha, always the tab colour, never grey
        const fg = sel ? "#FFFFFF" : color;
        const isMe = t.id === "me";
        const isPressed = pressed === t.id;
        return (
          <button key={t.id} onClick={() => pressTab(t)} type="button" aria-label={t.label}
            data-tab={t.id} data-selected={sel ? "1" : "0"}
            data-pressed={isPressed ? "1" : "0"}
            aria-current={sel ? "page" : undefined}
            style={{
              flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 3,
              padding: "8px 4px 6px", borderRadius: 18, border: "none",
              background: bg, color: fg, cursor: "pointer", fontFamily: NUN,
              transform: isPressed ? "scale(0.88)" : "scale(1)",
              transition: "background 0.15s ease, color 0.15s ease, transform 0.14s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <span style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {isMe ? (
                <span data-me-avatar style={{
                  width: 26, height: 26, borderRadius: "50%", background: kidGrad,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontFamily: FRED, fontWeight: 700, fontSize: 13, color: "#fff",
                  border: sel ? "2px solid #fff" : "2px solid transparent",
                  boxShadow: sel ? "0 0 0 1px rgba(255,255,255,0.35)" : "none",
                }}>{kidInit}</span>
              ) : t.glyph}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2px" }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
