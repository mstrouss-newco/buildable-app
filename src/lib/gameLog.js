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
export function logGameEvent(event, game, meta) {
  try {
    const g = game || currentGame;
    if (!g || ["play", "win", "lose"].indexOf(event) === -1) return;
    const kid = getActiveKid();
    const body = { deviceId: deviceId(), kidProfileId: (kid && kid.id) || null, game: g, event };
    if (meta && typeof meta === "object") body.meta = meta;   // e.g. { score, best, newBest } so bests are logged
    fetch("/api/log-game-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch (e) {}
}

// logSkillEvent - one practiced skill (correct/incorrect) into the SAME per-kid
// learning ledger (learning_events, Session 6B) that the shell's quiz gates write
// to. This is the shell side of the CARTRIDGE-CONTRACT `skill` message: a native
// learning game posts {source:"buildable", kind:"skill", subject, skill, correct,
// questionId?, quizType?} and the shell relays it here. Best-effort, fire-and-forget,
// never blocks or throws on the client, and a dropped report can never break play.
export function logSkillEvent(ev) {
  try {
    if (!ev || typeof ev.correct !== "boolean" || !ev.subject) return;
    const kid = getActiveKid();
    fetch("/api/log-learning-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        kidProfileId: (kid && kid.id) || null,
        deviceId: deviceId(),
        subject: ev.subject,
        skill: ev.skill || null,
        grade: ev.grade || null,
        quizType: ev.quizType || null,
        correct: ev.correct,
        questionId: ev.questionId || null,
        game: ev.game || currentGame || null,
      }),
    }).catch(() => {});
  } catch (e) {}
}
