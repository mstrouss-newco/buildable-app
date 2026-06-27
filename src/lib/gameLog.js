// gameLog — per-kid game telemetry. The app logs a "play" when a game screen
// opens (BuildableKids), and "win"/"lose" when a game posts its result
// (HelperReactions). currentGame is shared module state so the win/lose handler
// knows WHICH game without each game needing to send its own slug.
import { getActiveKid } from "./accounts";

let currentGame = null;
function deviceId() {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) { id = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); localStorage.setItem("deviceId", id); }
    return id;
  } catch { return "dev_anon"; }
}
export function setCurrentGame(slug) { currentGame = slug || null; }
export function getCurrentGame() { return currentGame; }
export function logGameEvent(event, game) {
  try {
    const g = game || currentGame;
    if (!g || ["play", "win", "lose"].indexOf(event) === -1) return;
    const kid = getActiveKid();
    fetch("/api/log-game-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ deviceId: deviceId(), kidProfileId: (kid && kid.id) || null, game: g, event }),
    }).catch(() => {});
  } catch (e) {}
}
