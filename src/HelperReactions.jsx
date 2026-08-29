// HelperReactions — the ONE place the Buddy 2.0 moment shows on screen. Mounted
// once in main.jsx, outside the screen switch. It listens for contract messages
// posted by games (BB.win()/BB.lose()/... -> postMessage {source:"buildable"})
// and for the Home "welcome" message, hands each event to the buddy brain
// (src/lib/buddy.js), and — only when the brain decides the moment is worth it —
// pops the kid's helper, speaks one short line, bounces, then hides.
//
// The brain owns the hard rules (rare + specific, a few per session, quiet gaps,
// parent off switch). This file only renders and voices. It never pops during
// play: wins/level clears/game-overs are natural break points, and score/coins
// are treated as context, never an interruption.
import { useEffect, useRef, useState } from "react";
import { getActiveKid, getKidHelper } from "./lib/accounts";
import { playVoiceUrl } from "./lib/voiceBus";
import { logGameEvent, getCurrentGame } from "./lib/gameLog";
import { decideMoment, isBuddyEnabled } from "./lib/buddy";

const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const KINDS = ["win", "lose", "levelup", "cheer", "levelComplete", "score", "coins", "welcome"];

// Friendly display names for games without a manifest yet (used only in buddy
// lines). Manifest games supply their own name.
const NAME_FALLBACK = {
  platformer: "Platformer", survival: "Survival", breaker: "Breaker", castle: "Castle Guard",
  croc: "Croc Tot", tumble: "Tumble Blocks", chess: "Chess", typing: "Typing", tennis: "Tennis",
  town: "Family Town", tictactoe: "Tic-Tac-Toe", connectfour: "Connect Four", dotsboxes: "Dots and Boxes",
  sling: "Sling Squad", tank: "Hilltop Tanks", mahjong: "Mahjong", stringmatch: "String Match",
  bubble: "Bubble Buddies", generated: "your game",
};

// Per-game buddy config from the manifest (personality + on/off + display name),
// fetched once per game and cached.
const manifestCache = {};
async function loadBuddyManifest(slug) {
  if (!slug) return null;
  if (slug in manifestCache) return manifestCache[slug];
  try {
    const r = await fetch("/" + slug + "/manifest.json", { cache: "force-cache" });
    if (!r.ok) { manifestCache[slug] = null; return null; }
    const m = await r.json();
    const b = (m.features && m.features.buddy) || {};
    const info = { personality: b.personality || "cheerleader", on: b.on !== false, name: m.name || null };
    manifestCache[slug] = info; return info;
  } catch (e) { manifestCache[slug] = null; return null; }
}

export default function HelperReactions() {
  const [show, setShow] = useState(false);
  const [state, setState] = useState({ tone: "win", text: "" });
  const hideRef = useRef(null);

  useEffect(() => {
    const onMsg = async (e) => {
      const d = e && e.data;
      if (!d || d.source !== "buildable" || !d.kind || KINDS.indexOf(d.kind) === -1) return;

      // Telemetry stays independent of whether the buddy speaks.
      if (d.kind === "win" || d.kind === "lose") { try { logGameEvent(d.kind, null, d.meta); } catch (err) {} }
      if (!isBuddyEnabled()) return;

      // Resolve the game + its personality (welcome is a home moment, no game).
      const slug = d.kind === "welcome" ? null : (d.game || getCurrentGame());
      let personality = "cheerleader", gameName = null;
      if (slug) {
        const info = await loadBuddyManifest(slug);
        if (info && info.on === false) return; // buddy switched off for this game
        if (info) { personality = info.personality; gameName = info.name; }
        if (!gameName) gameName = NAME_FALLBACK[slug] || null;
      }

      const kid = getActiveKid();
      const kidName = (kid && kid.display_name) || "friend";
      const meta = d.meta || (d.text ? { text: d.text } : {});
      const moment = decideMoment({
        kind: d.kind, meta, game: slug, gameName, personality, kidName,
        favoriteGameName: d.favoriteGameName || null,
      });
      if (!moment) return; // brain decided to stay quiet (the common case)

      setState({ tone: moment.tone || "win", text: moment.text });
      setShow(true);
      // Speak the line in the kid's helper voice; silent if voice isn't set up.
      try {
        const helper = getKidHelper(getActiveKid());
        const vid = helper && helper.voice;
        fetch("/api/narrate-story-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vid ? { text: moment.text, voiceId: vid } : { text: moment.text }) })
          .then((r) => r.json())
          .then((j) => { if (j && j.configured && j.audioUrl) playVoiceUrl(j.audioUrl); })
          .catch(() => {});
      } catch (err) {}
      clearTimeout(hideRef.current);
      hideRef.current = setTimeout(() => setShow(false), 6000);
    };
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(hideRef.current); };
  }, []);

  if (!show) return null;
  const helper = getKidHelper(getActiveKid());
  const img = helper && helper.image;
  const accent = state.tone === "win" ? "#7CF6B0" : "#FFD66B";
  // GN2 — the toast floats at the bottom of the page, which is exactly where the
  // five-tab bottom bar sits on every deciding screen. The bar publishes its own
  // height on <html> as --bk-bottom-bar while it is mounted (src/BottomBar.jsx),
  // so the toast raises itself clear whenever the bar is up and falls back to a
  // plain 24px on every screen without one. No screen knowledge needed here.
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: "calc(var(--bk-bottom-bar, 0px) + 24px)", zIndex: 100000, display: "flex", justifyContent: "center", pointerEvents: "none", fontFamily: NUN }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, maxWidth: "92%" }}>
        <div className="bk-pop" style={{ maxWidth: 260, background: "#1b1830", border: "1px solid " + accent + "88", borderRadius: "16px 16px 16px 4px", padding: "12px 16px", color: "#fff", boxShadow: "0 12px 34px rgba(0,0,0,0.55)", fontWeight: 800, fontSize: 16, lineHeight: 1.35 }}>{state.text}</div>
        <div className="bk-bounce" style={{ width: 84, height: 84, flexShrink: 0, borderRadius: "50%", border: "3px solid " + accent, overflow: "hidden", background: img ? ("center/cover no-repeat url(" + img + ")") : "linear-gradient(135deg,#9b7edd,#6f5bd6)", boxShadow: "0 10px 30px rgba(155,126,221,0.6)" }} />
      </div>
    </div>
  );
}
