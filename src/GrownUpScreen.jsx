// /src/GrownUpScreen.jsx
// -------------------------------------------------------------
// Grown-ups area: a proper, dedicated account flow.
//
// Redesigned to the Buildable brand: dark starfield surface, the
// gradient "buildablekids." wordmark, clean app-icon glyphs, and
// gradient-circle kid avatars with initials. NO EMOJI anywhere.
//
// This screen is a guided, multi-STEP flow (not a single cramped panel):
//
// STEP "choose" -> pick a lane: Continue with Google (preferred), use
// email instead, or continue without an account.
// STEP "auth" -> parent signs up or signs in (Google or email).
// STEP "picker" -> "Who's playing?" tap-a-tile kid picker.
// STEP "gate" -> grown-up-only math check before the Parents area.
// STEP "parents" -> create + manage kid profiles.
// STEP "projects" -> assign existing creations (songs/games) to a kid.
//
// Google sign-in (preferred): signInWithGoogle() redirects to Supabase ->
// Google -> back here with tokens in the URL hash; completeOAuthRedirect()
// (run on mount) finishes the sign-in. The agent never types passwords.
//
// All data access goes through src/lib/accounts.js, which branches between
// the guest (device) store and the account (Supabase) store.
//
// Props: { onBack, onProfileChosen } -- unchanged contract so the parent
// route in BuildableKids.jsx needs no edits.
// -------------------------------------------------------------
import { useState, useEffect } from "react";
import {
  isConfigured, isSignedIn, signInParent, signUpParent, signOut,
  listKidProfiles, createKidProfile, renameKidProfile, deleteKidProfile,
  setActiveKid, getActiveKid,
  listFamilyProjects, assignProjectToKid,
  signInWithGoogle, completeOAuthRedirect,
  getFamilyStatus, joinFamilyByCode,
  AVATARS, DEFAULT_AVATAR, kidHasPin, verifyKidPin,
} from "./lib/accounts";
import { getLearningSettings, setLearningSettings, learningGoalOptions, learningAgeRange, learningGradeOptions, getProgress, BADGES, progressSubjects, weakestSubject, reviewCount, subjectMastery, progressHistory, lessonsProgress } from "./store";
import { isBuddyEnabled, setBuddyEnabled } from "./lib/buddy";

const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const GRAD_BTN = "linear-gradient(90deg, #8A6BFF 0%, #E0578F 100%)";
const CARD_BG = "rgba(255,255,255,0.045)";
const CARD_BORDER = "1px solid rgba(255,255,255,0.10)";

// Kid avatars are colors, not pictures. Each kid gets a gradient circle
// with their first initial. The DB `avatar` column stores a color key
// (e.g. "purple"); legacy rows (old emoji values) fall back to a color
// derived from the child's name, so nothing breaks and no emoji renders.
const COLORS = [
  { key: "purple", grad: "linear-gradient(160deg,#8A6BFF,#6A4FE0)" },
  { key: "pink",   grad: "linear-gradient(160deg,#F2789E,#E0578F)" },
  { key: "blue",   grad: "linear-gradient(160deg,#4FA6E8,#2F8FD6)" },
  { key: "green",  grad: "linear-gradient(160deg,#3DD06A,#2BB14F)" },
  { key: "amber",  grad: "linear-gradient(160deg,#FFC75A,#F0972A)" },
  { key: "teal",   grad: "linear-gradient(160deg,#46D7C0,#1FA897)" },
];
const COLOR_MAP = Object.fromEntries(COLORS.map((c) => [c.key, c.grad]));

function avatarGrad(kid) {
  if (kid && kid.avatar && COLOR_MAP[kid.avatar]) return COLOR_MAP[kid.avatar];
  const name = (kid && kid.display_name) || "?";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length].grad;
}
function initialOf(kid) {
  const n = ((kid && kid.display_name) || "").trim();
  return n ? n[0].toUpperCase() : "?";
}

// Drawn-icon avatars (Session 6B). Each AVATARS key maps to a simple white SVG
// motif on the catalog color — NO emoji. Legacy color-key / old rows fall back
// to the initial-on-gradient look above so nothing breaks.
const AVATAR_COLOR = Object.fromEntries(AVATARS.map((a) => [a.key, a.color]));
function AvatarMotif({ k }) {
  const w = "#fff";
  switch (k) {
    case "fox": return (<g><path d="M18 20 L26 30 L14 30 Z" fill={w}/><path d="M46 20 L50 30 L38 30 Z" fill={w}/><circle cx="26" cy="38" r="3" fill={w}/><circle cx="38" cy="38" r="3" fill={w}/><path d="M28 44 h8" stroke={w} strokeWidth="3" strokeLinecap="round"/></g>);
    case "owl": return (<g><circle cx="25" cy="30" r="8" fill={w}/><circle cx="39" cy="30" r="8" fill={w}/><circle cx="25" cy="30" r="3" fill="#333"/><circle cx="39" cy="30" r="3" fill="#333"/><path d="M30 38 l2 4 l2 -4 Z" fill={w}/></g>);
    case "cat": return (<g><path d="M18 18 L24 28 L14 28 Z" fill={w}/><path d="M46 18 L50 28 L40 28 Z" fill={w}/><circle cx="26" cy="36" r="3" fill={w}/><circle cx="38" cy="36" r="3" fill={w}/><path d="M20 40 h8 M36 40 h8" stroke={w} strokeWidth="2" strokeLinecap="round"/></g>);
    case "frog": return (<g><circle cx="24" cy="24" r="7" fill={w}/><circle cx="40" cy="24" r="7" fill={w}/><circle cx="24" cy="24" r="3" fill="#333"/><circle cx="40" cy="24" r="3" fill="#333"/><path d="M22 40 q10 8 20 0" fill="none" stroke={w} strokeWidth="3" strokeLinecap="round"/></g>);
    case "bear": return (<g><circle cx="20" cy="22" r="6" fill={w}/><circle cx="44" cy="22" r="6" fill={w}/><circle cx="26" cy="34" r="3" fill={w}/><circle cx="38" cy="34" r="3" fill={w}/><circle cx="32" cy="42" r="4" fill={w}/></g>);
    case "fish": return (<g><path d="M18 32 q10 -12 24 0 q-10 12 -24 0 Z" fill={w}/><path d="M42 32 l10 -7 v14 Z" fill={w}/><circle cx="26" cy="30" r="2.5" fill="#333"/></g>);
    case "star": return (<path d="M32 16 l5 12 13 1 -10 8 3 13 -11 -7 -11 7 3 -13 -10 -8 13 -1 Z" fill={w}/>);
    case "robot": return (<g><rect x="20" y="22" width="24" height="20" rx="4" fill={w}/><circle cx="27" cy="32" r="3" fill="#333"/><circle cx="37" cy="32" r="3" fill="#333"/><path d="M32 16 v6" stroke={w} strokeWidth="3"/><circle cx="32" cy="15" r="2.5" fill={w}/></g>);
    default: return null;
  }
}
function AvatarMark({ kid, size = 56 }) {
  const key = kid && kid.avatar;
  const color = key && AVATAR_COLOR[key];
  if (color) {
    return (
      <span style={{ display: "inline-flex", width: size, height: size, borderRadius: "50%", overflow: "hidden", background: color }}>
        <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><AvatarMotif k={key} /></svg>
      </span>
    );
  }
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: "50%", background: avatarGrad(kid), color: "#fff", fontWeight: 800, fontSize: size * 0.4 }}>{initialOf(kid)}</span>;
}

// The brand wordmark, used in place of the old family emoji.
function Wordmark() {
  return (
    <div style={S.logo}>
      buildablekids<span style={{ color: "#E87BB0" }}>.</span>
    </div>
  );
}

// Inline Google "G" mark so the button needs no external asset.
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"
      style={{ display: "block" }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}

// Small clean glyphs for the "organize creations" list (no emoji).
function SongGlyph() {
  return (
    <span style={S.projIcon}>
      <span style={{ ...S.projIconBox, background: COLOR_MAP.purple }}>
        <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
          <ellipse cx="17" cy="33" rx="7" ry="5.2" transform="rotate(-20 17 33)" fill="#fff"/>
          <rect x="22.6" y="11" width="3.2" height="22.5" fill="#fff"/>
          <path d="M25.8 11 q11 3 8.5 15 q.5 -8 -8.5 -9 z" fill="#fff"/>
        </svg>
      </span>
    </span>
  );
}
function GameGlyph() {
  return (
    <span style={S.projIcon}>
      <span style={{ ...S.projIconBox, background: COLOR_MAP.green }}>
        <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
          <rect x="6" y="18" width="36" height="16" rx="8" fill="#fff"/>
          <rect x="12" y="22.5" width="3.2" height="9" rx="1" fill="#2BB14F"/>
          <rect x="9" y="25.5" width="9.2" height="3.2" rx="1" fill="#2BB14F"/>
          <circle cx="32" cy="24.5" r="2.4" fill="#2BB14F"/>
          <circle cx="37" cy="29" r="2.4" fill="#2BB14F"/>
        </svg>
      </span>
    </span>
  );
}

// Device id for the no-login lane (shared with the rest of the app).
function gsDeviceId() {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) { id = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); localStorage.setItem("deviceId", id); }
    return id;
  } catch { return "dev_anon"; }
}

export default function GrownUpScreen({ onBack, onProfileChosen, onOpenFriends, preVerified }) {
  // Flow steps. Start on the kid picker when already signed in (returning
  // parent); otherwise start on the lane chooser.
  const [step, setStep] = useState(
    preVerified
      ? (isSignedIn() ? "parents" : "choose")
      : (isSignedIn() ? "picker" : "choose")
  );

  // auth form
  const [mode, setMode] = useState("signup"); // 'signup' | 'signin'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [signedIn, setSignedIn] = useState(isSignedIn());

  // kid profiles
  const [kids, setKids] = useState([]);
  const [loadingKids, setLoadingKids] = useState(true);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState(DEFAULT_AVATAR);
  const [newGrade, setNewGrade] = useState("");
  const [newPin, setNewPin] = useState("");

  // grown-up gate (simple check so kids can't wander into the Parents area)
  const [gateA] = useState(() => 3 + Math.floor(Math.random() * 7));
  const [gateB] = useState(() => 3 + Math.floor(Math.random() * 7));
  const [gateInput, setGateInput] = useState("");
  const [gateError, setGateError] = useState(null);
  function openParents() {
    // Already math-gated by the top-nav Grown-ups button, or no kids yet
    // to protect -> go straight in without a second math question.
    if (preVerified || !kids || kids.length === 0) { setGateError(null); setStep("parents"); return; }
    setGateInput(""); setGateError(null); setStep("gate");
  }
  function submitGate(e) {
    e.preventDefault();
    if (parseInt(gateInput, 10) === gateA * gateB) { setGateError(null); setStep("parents"); }
    else { setGateError("Not quite — ask a grown-up to help."); }
  }

  // ---- co-parents (add another grown-up to this family) ----
  const [familyCode, setFamilyCode] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [joinedFamily, setJoinedFamily] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyMsg, setFamilyMsg] = useState(null);
  const [familyErr, setFamilyErr] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);

  async function refreshFamily() {
    try {
      const st = await getFamilyStatus();
      setFamilyCode(st.code); setMemberCount(st.memberCount); setJoinedFamily(st.joinedFamily);
    } catch (e) { /* backend not ready -> hide the section */ }
  }
  function copyCode() {
    try {
      navigator.clipboard.writeText(familyCode || "");
      setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500);
    } catch (e) { /* clipboard blocked -> code is visible to read out */ }
  }
  async function handleJoinFamily(e) {
    e.preventDefault();
    setFamilyErr(null); setFamilyMsg(null); setFamilyBusy(true);
    try {
      await joinFamilyByCode(joinCode);
      setJoinCode("");
      setFamilyMsg("Joined! You now share this family's kids.");
      await refreshFamily();
      await refreshKids();
    } catch (err) { setFamilyErr(err.message || "Could not join that family"); }
    finally { setFamilyBusy(false); }
  }
  const [active, setActive] = useState(getActiveKid());

  // projects (assign-to-kid)
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const configured = isConfigured();

  // If we just came back from a Google sign-in, finish it: pull the tokens
  // out of the URL hash, save the session, and jump to the kid picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const done = await completeOAuthRedirect();
        if (done && !cancelled) {
          setSignedIn(true);
          setStep("picker");
        }
      } catch (e) { /* ignore -- normal load with no redirect */ }
    })();
    return () => { cancelled = true; };
  }, []);

  async function refreshKids() {
    setLoadingKids(true);
    try { setKids(await listKidProfiles()); }
    catch (e) {
      if (e && e.code === "SESSION_LOST") {
        // The sign-in vanished between the check and the request (seen on iPad
        // Safari). Ask for the sign-in again -- NEVER show "add your first
        // child" to a family that already has kids on the server.
        setKids([]);
        setSignedIn(false);
        setNotice("Your sign-in dropped out. Tap Continue with Google to pick up where you left off.");
        setStep("choose");
      } else setError(e.message);
    }
    finally { setLoadingKids(false); }
  }

  // Guest lane: nothing is saved off this device, so there is nothing to set up.
  // Make one "Player" profile behind the scenes and start playing.
  async function playAsGuest() {
    setError(null);
    try {
      const existing = await listKidProfiles();
      if (existing && existing.length) { chooseKid(existing[0]); return; }
      const created = await createKidProfile("Player", DEFAULT_AVATAR);
      await refreshKids();
      if (created && created.id) { chooseKid(created); return; }
      setStep("picker");
    } catch (e) { setStep("picker"); }
  }

  useEffect(() => { refreshKids(); }, [signedIn]);
  useEffect(() => { if (signedIn) refreshFamily(); }, [signedIn]);

  // Guest games: zero-account "play a friend by link" matches this family's kids
  // started (the grandma flow). Read-only visibility, per the safety shape.
  const [guestGames, setGuestGames] = useState([]);
  async function refreshGuestGames(kidList) {
    const ids = (kidList || []).map((k) => k.id).filter(Boolean);
    if (!ids.length) { setGuestGames([]); return; }
    try {
      const r = await fetch("/api/invite?kids=" + encodeURIComponent(ids.join(",")));
      const j = await r.json().catch(() => ({}));
      setGuestGames(Array.isArray(j.matches) ? j.matches : []);
    } catch (e) { /* backend not ready -> hide the section */ }
  }
  useEffect(() => { if (signedIn) refreshGuestGames(kids); }, [signedIn, kids]);

  async function refreshProjects() {
    setLoadingProjects(true);
    try {
      const acct = await listFamilyProjects().catch(() => []); // filed rows (account, any device)
      const did = gsDeviceId();
      const dev = [];
      try {
        const [sg, gm] = await Promise.all([
          fetch("/api/list-songs?deviceId=" + encodeURIComponent(did)).then((r) => r.json()).catch(() => ({})),
          fetch("/api/list-games?deviceId=" + encodeURIComponent(did)).then((r) => r.json()).catch(() => ({})),
        ]);
        (sg && sg.songs || []).forEach((s) => dev.push({ kind: "song", projectId: s.song_id, title: s.title || "Untitled song", kidProfileId: s.kid_profile_id || null }));
        (gm && gm.games || []).forEach((g) => dev.push({ kind: "game", projectId: g.game_id || g.id, title: g.title || "Untitled game", kidProfileId: g.kid_profile_id || null }));
      } catch (e) { /* device lane optional */ }
      // Merge + dedupe by kind:id, preferring a row that already names a kid.
      const map = new Map();
      for (const p of [...(acct || []), ...dev]) {
        const key = p.kind + ":" + p.projectId;
        const prev = map.get(key);
        if (!prev || (!prev.kidProfileId && p.kidProfileId)) map.set(key, p);
      }
      setProjects([...map.values()]);
    }
    catch (e) { setError(e.message); }
    finally { setLoadingProjects(false); }
  }

  // ---- Google (preferred) ----
  function handleGoogle() {
    setError(null);
    try { signInWithGoogle(); }
    catch (err) { setError((err && err.message) || "Could not start Google sign-in"); }
  }

  // ---- email auth ----
  async function handleAuth(e) {
    e.preventDefault();
    setError(null); setNotice(null); setBusy(true);
    try {
      if (mode === "signup") {
        const res = await signUpParent(email.trim(), password);
        if (res && res.needsEmailConfirmation) {
          setNotice("Almost there! Check " + (email.trim() || "your email") +
            " for a confirmation link, then come back and sign in.");
          setMode("signin");
          setPassword("");
          return;
        }
      } else {
        await signInParent(email.trim(), password);
      }
      setSignedIn(true);
      setStep("picker");
      setPassword("");
    } catch (err) {
      const m = (err && err.message) || "Could not sign in";
      if (/rate limit/i.test(m)) {
        setError("Too many tries just now. Please wait a few minutes and try again.");
      } else if (/already registered|already been registered/i.test(m)) {
        setError("That email already has an account. Try signing in instead.");
        setMode("signin");
      } else if (/confirm/i.test(m)) {
        setError("Please confirm your email first (check your inbox), then sign in.");
      } else {
        setError(m);
      }
    } finally { setBusy(false); }
  }

  async function handleSignOut() {
    signOut();
    setSignedIn(false);
    setActive(null);
    setStep("choose");
    await refreshKids();
  }

  // ---- kid profiles ----
  async function handleAddKid(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    try {
      const created = await createKidProfile(newName.trim(), newAvatar, { grade: newGrade || null, pin: /^[0-9]{4}$/.test(newPin) ? newPin : null });
      const wasFirst = kids.length === 0;
      setNewName("");
      setNewAvatar(DEFAULT_AVATAR);
      setNewGrade("");
      setNewPin("");
      await refreshKids();
      // The first child is the end of setup, not the middle of it. Go straight
      // into that child's Home instead of leaving a grown-up staring at a
      // cleared form wondering whether anything happened.
      if (wasFirst && created && created.id) { chooseKid(created); return; }
      setStep("picker");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function chooseKid(kid) {
    // Optional kid PIN: siblings who snoop must know the 4 digits to enter.
    if (kidHasPin(kid)) {
      const entered = window.prompt(`Enter ${kid.display_name}'s PIN`);
      if (entered == null) return;              // cancelled
      if (!verifyKidPin(kid, entered.trim())) { setError("That PIN was not right."); return; }
    }
    setError(null);
    setActiveKid(kid);
    setActive(kid);
    if (onProfileChosen) onProfileChosen(kid); // parent applies the kid's grade after loading their learning scope
  }

  async function handleRename(kid) {
    const next = window.prompt("Rename this profile", kid.display_name || "");
    if (next == null) return;
    const name = next.trim();
    if (!name) return;
    setBusy(true); setError(null);
    try {
      await renameKidProfile(kid.id, name);
      if (active && active.id === kid.id) setActive({ ...active, display_name: name });
      await refreshKids();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function handleDeleteKid(kid) {
    const ok = window.confirm("Remove " + (kid.display_name || "this profile") +
      "? Their saved creations stay in the library.");
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      await deleteKidProfile(kid.id);
      if (active && active.id === kid.id) setActive(null);
      await refreshKids();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  // ---- projects ----
  function goProjects() {
    setStep("projects");
    setError(null);
    refreshProjects();
  }

  async function handleAssign(project, kidProfileId) {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/assign-creation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: project.kind, id: project.projectId, kidProfileId: kidProfileId || null, deviceId: gsDeviceId() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || j.detail || ("Couldn't file this (error " + r.status + ")"));
      await refreshProjects();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  // Back means "one step back in THIS flow", not "leave the flow". The old
  // handler sent nearly every step to onBack(), and onBack() lands on this very
  // screen while no kid is chosen -- so the button did nothing at all, on every
  // screen. On the first step there is nowhere back to, so it is hidden.
  function backFromStep() {
    setError(null); setNotice(null);
    if (step === "auth") return setStep("choose");
    if (step === "gate") return setStep("picker");
    if (step === "projects") return setStep("parents");
    if (step === "parents") return setStep(signedIn || kids.length ? "picker" : "choose");
    if (step === "picker") return active ? onBack() : setStep("choose");
    return onBack();
  }

  // -------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------
  return (
    <div style={S.container}>
      <div style={S.topRow}>
        {step === "choose"
          ? <span />
          : <button onClick={backFromStep} style={S.backBtn}>← Back</button>}
        {signedIn && <button onClick={handleSignOut} style={S.backBtn}>Sign out</button>}
      </div>

      <Wordmark />

      {/* STEP: choose a lane ------------------------------------- */}
      {step === "choose" && !signedIn && (
        <>
          <h1 style={S.title}>Set up your family</h1>
          <div style={S.card}>
            <p style={S.lead}>Your kids' creations follow them on any device.</p>
            {notice && <p style={S.noticeBox}>{notice}</p>}
            {!configured && (
              <p style={S.warn}>
                Accounts aren't switched on for this site yet. You can still play as a
                guest below; a grown-up can enable accounts in the site settings.
              </p>
            )}
            <button style={S.googleBtn} disabled={!configured} onClick={handleGoogle}>
              <GoogleG /> <span style={{ marginLeft: 10 }}>Continue with Google</span>
            </button>
            <button style={S.secondaryBig} disabled={!configured}
              onClick={() => { setMode("signup"); setStep("auth"); }}>
              Continue with email
            </button>
            <div style={S.divider}><span style={S.dividerText}>or</span></div>
            <button style={S.ghostBig} onClick={playAsGuest}>
              Keep playing as a guest
            </button>
            <p style={S.fineprint}>
              Guest mode keeps profiles on this device only. No login, nothing leaves
              this device's library.
            </p>
          </div>
        </>
      )}

      {/* STEP: parent auth (email) ------------------------------- */}
      {step === "auth" && !signedIn && (
        <>
          <h1 style={S.title}>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <div style={S.card}>
            <button style={S.googleBtn} disabled={!configured} onClick={handleGoogle}>
              <GoogleG /> <span style={{ marginLeft: 10 }}>Continue with Google</span>
            </button>
            <div style={S.divider}><span style={S.dividerText}>or use email</span></div>
            <form onSubmit={handleAuth} style={S.form}>
              <label style={S.label}>Email
                <input className="bk-light" style={S.input} type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" />
              </label>
              <label style={S.label}>Password
                <input className="bk-light" style={S.input} type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required minLength={6} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters" />
              </label>
              {error && <p style={S.error}>{error}</p>}
              {notice && <p style={S.noticeBox}>{notice}</p>}
              <button type="submit" style={S.primaryBig} disabled={busy}>
                {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>
            <button style={S.linkBtn}
              onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); setNotice(null); }}>
              {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
            </button>
          </div>
        </>
      )}

      {/* STEP: profile picker — "Who's playing?" (clean: tap to choose) */}
      {(step === "picker" || (signedIn && step === "auth")) && (
        <>
          <h1 style={S.title}>Who's playing?</h1>
          <div style={S.card}>
            {loadingKids && <p style={S.muted}>Loading profiles…</p>}

            {!loadingKids && kids.length === 0 ? (
              signedIn ? (
                <>
                  <p style={S.lead}>Let's set up your first child's profile.</p>
                  <button style={S.primaryBig} onClick={() => setStep("parents")}>Add your first child</button>
                </>
              ) : (
                // Signed out with nothing on this device. Do NOT demand a child
                // profile: guest play saves nothing off this device anyway, and
                // a returning parent needs the way back to their account.
                <>
                  <p style={S.lead}>Ready when you are.</p>
                  <button style={S.primaryBig} onClick={playAsGuest}>Start playing</button>
                  <button style={S.ghostBig} onClick={() => setStep("choose")}>Sign in to find your family</button>
                </>
              )
            ) : (
              <>
                <div style={S.kidGrid}>
                  {kids.map((k) => (
                    <button key={k.id} onClick={() => chooseKid(k)} style={S.kidWrap}>
                      <AvatarMark kid={k} size={56} />
                      <span style={S.kidName}>{k.display_name}</span>
                    </button>
                  ))}
                </div>
                <p style={S.fineprint}>
                  {signedIn ? "Signed in — creations follow your kids on any device." : "Saved on this device."}
                </p>
              </>
            )}

            {error && <p style={S.error}>{error}</p>}
            <button style={S.ghostBig} onClick={openParents}>For grown-ups</button>
          </div>
        </>
      )}

      {/* STEP: grown-up gate ------------------------------------- */}
      {step === "gate" && (
        <>
          <h1 style={S.title}>Grown-ups only</h1>
          <div style={S.card}>
            <p style={S.lead}>Quick check — what is {gateA} × {gateB}?</p>
            <form onSubmit={submitGate} style={S.form}>
              <input className="bk-light" style={S.input} type="number" inputMode="numeric" autoFocus
                value={gateInput} onChange={(e) => setGateInput(e.target.value)}
                placeholder="Type the answer" />
              {gateError && <p style={S.error}>{gateError}</p>}
              <button type="submit" style={S.primaryBig}>Enter</button>
            </form>
            <button style={S.ghostBig} onClick={() => setStep("picker")}>← Back</button>
          </div>
        </>
      )}

      {/* STEP: parents management (add/edit kids + organize) ----- */}
      {step === "parents" && (
        <>
          <h1 style={S.title}>{kids.length ? "Parents" : "Add your child"}</h1>
          <div style={S.card}>
            {/* QA53 — this list is every PLAYER on the family account, and grown-ups
                who play have profiles here too. Calling the heading "Add or edit
                your kids" filed Dad and Mom as children. It says "players" now,
                which is true of everyone in the list and still obviously about
                setting the kids up. */}
            <p style={S.lead}>{kids.length
              ? "Everyone who plays on this account. Add a player for each child \u2014 a grown-up who plays can have one too."
              : "Just a first name and a face. Everything else can wait."}</p>

            {kids.length > 0 && (
              <div style={S.kidGrid}>
                {kids.map((k) => (
                  <div key={k.id} style={S.kidManageWrap}>
                    <div style={S.kidWrap}>
                      <AvatarMark kid={k} size={56} />
                      <span style={S.kidName}>{k.display_name}</span>
                    </div>
                    <div style={S.kidActions}>
                      {/* Name the child in the label too, so a screen reader (and
                          anyone glancing at a row of three) can tell whose Remove
                          button this is. */}
                      <button type="button" style={S.miniBtn} aria-label={"Rename " + k.display_name} onClick={() => handleRename(k)}>Rename</button>
                      <button type="button" style={S.miniBtnDanger} aria-label={"Remove " + k.display_name} onClick={() => handleDeleteKid(k)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddKid} style={S.addRow}>
              <div style={S.fieldLabel}>{kids.length ? "New player's first name" : "Child's first name"}</div>
              <input className="bk-light" style={S.input} value={newName} maxLength={40} autoFocus
                onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Riley" />
              <div style={S.fieldLabel}>Pick a face</div>
              <div style={S.avatarRow}>
                {AVATARS.map((a) => (
                  <button type="button" key={a.key} onClick={() => setNewAvatar(a.key)}
                    aria-label={"Avatar " + a.key}
                    style={{ ...S.avatarPick, ...(newAvatar === a.key ? S.avatarPickActive : {}) }}>
                    <AvatarMark kid={{ avatar: a.key }} size={40} />
                  </button>
                ))}
              </div>
              <div style={S.fieldLabel}>Grade (optional — sets the learning level)</div>
              <div style={S.avatarRow}>
                {learningGradeOptions().map((g) => (
                  <button type="button" key={g} onClick={() => setNewGrade(newGrade === g ? "" : g)}
                    style={{ ...S.gradePick, ...(newGrade === g ? S.gradePickActive : {}) }}>
                    {g === "k" ? "K" : g}
                  </button>
                ))}
              </div>
              {kids.length > 0 && (
                <input className="bk-light" style={S.input} value={newPin} inputMode="numeric" maxLength={4}
                  onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                  placeholder="Optional 4-digit PIN (for snoopy siblings)" />
              )}
              <button type="submit" style={S.primaryBig} disabled={busy || !newName.trim()}>
                {kids.length ? "Add player" : "Start playing"}
              </button>
            </form>

            {error && <p style={S.error}>{error}</p>}

            {signedIn && guestGames.length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: CARD_BORDER }}>
                <h2 style={{ ...S.title, fontSize: 20, margin: "0 0 4px" }}>Guest games</h2>
                <p style={S.lead}>Quick games your kids started by sending a link. Guests play one match only, with canned cheers, and the link expires on its own.</p>
                {guestGames.map((m) => {
                  const gameName = m.game === "chess" ? "Chess" : m.game === "ttt" ? "Tic-Tac-Toe" : m.game;
                  const state = m.status === "open" ? "Waiting for a friend" : m.status === "done" ? "Finished" : "In progress";
                  const when = m.updated_at ? new Date(m.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
                  return (
                    <div key={m.token} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", marginTop: 8, borderRadius: 12, border: CARD_BORDER }}>
                      <span>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{(m.host && m.host.name) || "Your kid"}{m.guest ? " vs " + m.guest.name : ""}</span>
                        <span style={{ display: "block", color: "#8a86a8", fontSize: 13 }}>{gameName} &middot; {state}{when ? " · " + when : ""}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {signedIn && kids.length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: CARD_BORDER }}>
                <h2 style={{ ...S.title, fontSize: 20, margin: "0 0 4px" }}>Add another parent</h2>
                <p style={S.lead}>
                  A second grown-up can make their own login and see the same kids.
                  Share this family code with them:
                </p>
                {familyCode ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 4px" }}>
                    <code style={{
                      flex: 1, fontFamily: FRED, fontSize: 22, letterSpacing: 3, color: "#fff",
                      background: "rgba(255,255,255,0.06)", border: CARD_BORDER, borderRadius: 12,
                      padding: "12px 14px", textAlign: "center",
                    }}>{familyCode}</code>
                    <button type="button" style={S.miniBtn} onClick={copyCode}>
                      {codeCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <p style={S.fineprint}>Your family code will appear here once accounts are set up.</p>
                )}
                {memberCount > 0 && (
                  <p style={S.fineprint}>
                    {memberCount} other grown-up{memberCount > 1 ? "s have" : " has"} joined your family.
                  </p>
                )}

                <p style={{ ...S.fineprint, marginTop: 14 }}>
                  Joining another parent's family? Enter their code:
                </p>
                <form onSubmit={handleJoinFamily} style={S.addRow}>
                  <input className="bk-light" style={S.input} value={joinCode} maxLength={12}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Family code (e.g. ABC234)" />
                  <button type="submit" style={S.primaryBig} disabled={familyBusy || !joinCode.trim()}>
                    {familyBusy ? "Joining…" : "Join family"}
                  </button>
                </form>
                {joinedFamily && <p style={S.fineprint}>You're linked to another grown-up's family.</p>}
                {familyMsg && <p style={S.noticeBox}>{familyMsg}</p>}
                {familyErr && <p style={S.error}>{familyErr}</p>}
              </div>
            )}

            {/* Learning Mode, buddy moments, progress and badges are settings FOR a
                child. Showing them before one exists is what made the first run feel
                like a hundred questions. */}
            {kids.length > 0 && <LearningModeCard />}

            {kids.length > 0 && <BuddyMomentsCard />}

            {kids.length > 0 && <LearningProgressCard />}

            {kids.length > 0 && <PracticeCard kids={kids} />}

            {signedIn && kids.length > 0 && (
              <button style={S.linkBtn} onClick={goProjects}>Organize creations by child →</button>
            )}
            {signedIn && kids.length > 0 && onOpenFriends && (
              <button style={S.linkBtn} onClick={onOpenFriends}>Manage friends & friend code →</button>
            )}
            {kids.length > 0 && (
              <button style={S.ghostBig} onClick={() => setStep("picker")}>← Done</button>
            )}
          </div>
        </>
      )}

      {/* STEP: assign projects to kids --------------------------- */}
      {step === "projects" && signedIn && (
        <>
          <h1 style={S.title}>Organize creations</h1>
          <div style={S.card}>
            <p style={S.lead}>Link each saved song or game to the child who made it.</p>
            {loadingProjects && <p style={S.muted}>Loading creations…</p>}
            {!loadingProjects && projects.length === 0 && (
              <p style={S.muted}>No saved creations yet. They'll appear here once kids make some.</p>
            )}
            <div style={S.projList}>
              {projects.map((p) => (
                <div key={p.kind + ":" + p.projectId} style={S.projRow}>
                  {p.kind === "game" ? <GameGlyph /> : <SongGlyph />}
                  <span style={S.projTitle}>{p.title}</span>
                  <select style={S.select} disabled={busy}
                    value={p.kidProfileId || ""}
                    onChange={(e) => handleAssign(p, e.target.value || null)}>
                    <option value="">Unassigned</option>
                    {kids.map((k) => (
                      <option key={k.id} value={k.id}>{k.display_name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {error && <p style={S.error}>{error}</p>}
            <button style={S.ghostBig} onClick={() => setStep("parents")}>← Back</button>
          </div>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// Buddy moments card (grown-ups). On by default. The Buddy 2.0 helper speaks
// rarely and specifically — a hard-won level, a new personal best, a welcome
// back that names a favorite game — a few times per sitting and never during
// play. This switch turns all of that off for families who want it quiet.
// No emojis: the control is a CSS switch.
// -------------------------------------------------------------
function BuddyMomentsCard() {
  const [on, setOn] = useState(() => isBuddyEnabled());
  function toggle() { const next = !on; setBuddyEnabled(next); setOn(next); }
  return (
    <div style={LM.wrap}>
      <div style={LM.headerRow}>
        <div>
          <div style={LM.title}>Buddy moments</div>
          <div style={LM.sub}>The buddy cheers now and then — beating a tough level, a new best score, a welcome back. A few times a session, never during play.</div>
        </div>
        <button type="button" role="switch" aria-checked={on} onClick={toggle} style={{ ...LM.switch, ...(on ? LM.switchOn : {}) }}>
          <span style={{ ...LM.knob, ...(on ? LM.knobOn : {}) }} />
        </button>
      </div>
    </div>
  );
}


// Learning Mode card (grown-ups). Off by default. When on, the app turns
// render-wait mini-games and quick moments into one real practice question.
// No emojis: the on/off control is a CSS switch, the goal picker is buttons.
// -------------------------------------------------------------
function LearningModeCard() {
  const [settings, setSettings] = useState(() => getLearningSettings());
  const goals = learningGoalOptions();
  const goalLabel = { math: "Math", reading: "Reading", mix: "A mix" };

  function toggle() {
    setSettings(setLearningSettings({ enabled: !settings.enabled }));
  }
  function pickGoal(goal) {
    setSettings(setLearningSettings({ goal }));
  }

  const ageRange = learningAgeRange();
  function setAge(next) {
    const clamped = Math.min(ageRange.max, Math.max(ageRange.min, next));
    setSettings(setLearningSettings({ age: clamped }));
  }
  const grades = learningGradeOptions();
  const gradeLabel = (g) => (g === "k" ? "K" : g);
  function pickGrade(g) {
    // Toggling a grade off ("") falls back to the age stepper.
    setSettings(setLearningSettings({ grade: settings.grade === g ? "" : g }));
  }
  // Parent per-moment overrides (Auto follows the game; On/Off force it).
  const MOMENTS = [
    { key: "beforeUnlock", label: "Question before a new level" },
    { key: "coinTopUp", label: "Earn coins by practicing" },
    { key: "bonusAfterWin", label: "Bonus question after a win" },
  ];
  const TRI = [
    { v: "auto", label: "Auto" },
    { v: "on", label: "On" },
    { v: "off", label: "Off" },
  ];
  function setMoment(key, v) {
    const moments = { ...(settings.moments || {}), [key]: v };
    setSettings(setLearningSettings({ moments }));
  }

  return (
    <div style={LM.wrap}>
      <div style={LM.headerRow}>
        <div>
          <div style={LM.title}>Learning Mode</div>
          <div style={LM.sub}>Turn waiting time into one quick practice question.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          onClick={toggle}
          style={{ ...LM.switch, ...(settings.enabled ? LM.switchOn : {}) }}
        >
          <span style={{ ...LM.knob, ...(settings.enabled ? LM.knobOn : {}) }} />
        </button>
      </div>

      {settings.enabled && (
        <div style={LM.goalsWrap}>
          <div style={LM.goalsLabel}>What should we practice?</div>
          <div style={LM.goalsRow}>
            {goals.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => pickGoal(g)}
                style={{ ...LM.goalBtn, ...(settings.goal === g ? LM.goalBtnActive : {}) }}
              >
                {goalLabel[g] || g}
              </button>
            ))}
          </div>

          <div style={LM.ageLabel}>Grade</div>
          <div style={LM.goalsRow}>
            {grades.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => pickGrade(g)}
                style={{ ...LM.gradeBtn, ...(settings.grade === g ? LM.goalBtnActive : {}) }}
              >
                {gradeLabel(g)}
              </button>
            ))}
          </div>
          {!settings.grade && (
            <>
              <div style={LM.ageLabel}>Or set an exact age</div>
              <div style={LM.ageRow}>
                <button
                  type="button"
                  aria-label="Younger"
                  disabled={settings.age <= ageRange.min}
                  onClick={() => setAge(settings.age - 1)}
                  style={{ ...LM.ageStep, ...(settings.age <= ageRange.min ? LM.ageStepOff : {}) }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor" />
                  </svg>
                </button>
                <div style={LM.ageValue}>
                  <span style={LM.ageNum}>{settings.age}</span>
                  <span style={LM.ageUnit}>years</span>
                </div>
                <button
                  type="button"
                  aria-label="Older"
                  disabled={settings.age >= ageRange.max}
                  onClick={() => setAge(settings.age + 1)}
                  style={{ ...LM.ageStep, ...(settings.age >= ageRange.max ? LM.ageStepOff : {}) }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor" />
                    <rect x="7" y="3" width="2" height="10" rx="1" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </>
          )}
          <div style={LM.ageHint}>Grade sets how hard the practice questions are.</div>

          <div style={LM.ageLabel}>Learning moments</div>
          <div style={LM.momentsHint}>Auto follows each game. On or Off overrides it everywhere.</div>
          {MOMENTS.map((m) => {
            const cur = (settings.moments && settings.moments[m.key]) || "auto";
            return (
              <div key={m.key} style={LM.momentRow}>
                <span style={LM.momentLabel}>{m.label}</span>
                <span style={LM.triWrap}>
                  {TRI.map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      onClick={() => setMoment(m.key, t.v)}
                      style={{ ...LM.triBtn, ...(cur === t.v ? LM.triBtnActive : {}) }}
                    >
                      {t.label}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// -------------------------------------------------------------
// Learning progress (grown-ups). Read-only summary of on-device progress:
// questions right, current day streak, badges earned, per-subject strength
// bars, and a badge shelf (earned in color, unearned dimmed). All visuals are
// SVG/CSS — no emoji. Shows nothing meaningful until a kid answers in
// Learning Mode; copy stays friendly when empty.
// -------------------------------------------------------------
const SUBJECT_LABEL = { math: "Math", geometry: "Shapes", spelling: "Spelling", reading: "Reading" };

// Small SVG rosette used in the badge shelf. `on` toggles full color vs dimmed.
function BadgeIcon({ on, size = 40 }) {
  const ribbon = on ? "#FFC75A" : "rgba(255,255,255,0.10)";
  const ribbonEdge = on ? "#F0972A" : "rgba(255,255,255,0.18)";
  const check = on ? "#7a4b00" : "rgba(255,255,255,0.28)";
  const tail = on ? "#E0578F" : "rgba(255,255,255,0.10)";
  const tailEdge = on ? "#b5396e" : "rgba(255,255,255,0.18)";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="26" r="18" fill={ribbon} stroke={ribbonEdge} strokeWidth="2.5" />
      <path d="M24 26.5l5.5 5.5 11-12" fill="none" stroke={check} strokeWidth="4"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25 41 L21 60 L32 53 L43 60 L39 41 Z" fill={tail} stroke={tailEdge} strokeWidth="1.5" />
    </svg>
  );
}

function StatusChip({ status }) {
  const map = {
    mastered: { label: "Mastered", bg: "rgba(0,196,140,0.18)", bd: "rgba(0,196,140,0.5)", fg: "#7dffce" },
    practicing: { label: "Practicing", bg: "rgba(255,199,90,0.16)", bd: "rgba(255,199,90,0.45)", fg: "#ffd98a" },
    new: { label: "Not started", bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.18)", fg: "rgba(255,255,255,0.6)" },
  };
  const c = map[status] || map.new;
  return <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: c.bg, border: `1px solid ${c.bd}`, color: c.fg }}>{c.label}</span>;
}

// Tiny 7-day bar trend of correct answers (no library, pure divs). Height maps
// to that day's correct count against the busiest day in the window.
function TrendBars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.right));
  const dayLetters = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 46, marginTop: 6 }}>
      {data.map((d) => {
        const h = Math.round((d.right / max) * 38);
        const dow = new Date(d.date + "T00:00:00").getDay();
        return (
          <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div title={`${d.right} right`} style={{ width: "100%", maxWidth: 22, height: Math.max(3, h), borderRadius: 5, background: d.right ? "#00c48c" : "rgba(255,255,255,0.14)" }} />
            <span style={{ fontSize: 9.5, opacity: 0.55 }}>{dayLetters[dow]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session PT2/PT3 — the Practice row, one per kid.
//
// It reads and writes the SAME state the kid's practice page uses
// (localStorage bk_practice_v1, through public/buildable-practice.js), so
// there is one engine and one source of truth rather than a parent-side copy
// of the box rules. The engine is a plain script in public/, so it is loaded
// on demand and the card renders a quiet placeholder until it is there.
//
// What a grown-up can do here: see where each kid is and how much they know by
// heart, bump the word list up or down, send them back through the quick
// check, and set the sprint length and question target. Everything else stays
// the kid's.
// ---------------------------------------------------------------------------
function usePracticeEngine() {
  const [bp, setBp] = useState(() => (typeof window !== "undefined" ? window.BuildablePractice : null));
  useEffect(() => {
    if (bp || typeof document === "undefined") return;
    if (window.BuildablePractice) { setBp(window.BuildablePractice); return; }
    let el = document.querySelector('script[data-bk-practice]');
    if (!el) {
      el = document.createElement("script");
      el.src = "/buildable-practice.js";
      el.setAttribute("data-bk-practice", "1");
      document.head.appendChild(el);
    }
    const on = () => setBp(window.BuildablePractice || null);
    el.addEventListener("load", on);
    return () => el.removeEventListener("load", on);
  }, [bp]);
  return bp;
}

function PracticeCard({ kids }) {
  const BP = usePracticeEngine();
  const [decks, setDecks] = useState(null);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    fetch("/practice/decks/index.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && d.decks) setDecks(d.decks.slice().sort((a, b) => (a.order || 0) - (b.order || 0))); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!BP || !decks) {
    return (
      <div style={LP.wrap}>
        <div style={LP.title}>Practice</div>
        <div style={LP.empty}>Loading practice progress...</div>
      </div>
    );
  }

  const state = BP.loadState();
  const wordDecks = decks.filter((d) => d.subject === "reading");
  const mathDecks = decks.filter((d) => d.subject === "math");
  const nameOf = (id) => (decks.find((d) => d.id === id) || {}).name || "the first set";

  return (
    <div style={LP.wrap}>
      <div style={LP.title}>Practice</div>
      <div style={LP.sub}>
        Sight words and number facts. Kids move a word up a box when they get it right and quickly,
        and every word they truly know by heart becomes a bird in their collection.
      </div>

      {kids.map((kid) => {
        const by = BP.masteredByDeck(state, kid.id);
        const total = BP.masteredTotal(state, kid.id);
        const placed = BP.placement(state, kid.id);
        const current = BP.level(state, kid.id) || (wordDecks[0] || {}).id;
        const at = wordDecks.findIndex((d) => d.id === current);
        const set = BP.settings(state, kid.id);
        const bests = mathDecks
          .map((d) => ({ d, b: BP.sprintBest(state, kid.id, d.id) }))
          .filter((x) => x.b && x.b.best);

        const move = (delta) => {
          const next = wordDecks[Math.max(0, Math.min(wordDecks.length - 1, at + delta))];
          if (next) { BP.setLevel(kid.id, next.id); bump(); }
        };
        const setting = (key, delta, min, max) => {
          const cur = set[key];
          BP.setSettings(kid.id, { [key]: Math.max(min, Math.min(max, cur + delta)) });
          bump();
        };

        return (
          <div key={kid.id} data-practice-kid={kid.id} style={PC.row}>
            <div style={PC.head}>
              <AvatarMark kid={kid} size={34} />
              <div style={{ minWidth: 0 }}>
                <div style={PC.name}>{kid.display_name || "Your kid"}</div>
                <div style={PC.meta}>
                  {total > 0
                    ? total + (total === 1 ? " word known by heart" : " known by heart")
                    : "Nothing mastered yet - that is normal at the start"}
                </div>
              </div>
            </div>

            <div style={PC.line}>
              <span style={PC.lineLabel}>Working on</span>
              <span style={PC.lineValue}>{nameOf(current)}</span>
            </div>
            <div style={PC.btnRow}>
              <button
                onClick={() => move(-1)}
                disabled={at <= 0}
                style={{ ...PC.btn, opacity: at <= 0 ? 0.4 : 1 }}
              >Easier</button>
              <button
                onClick={() => move(1)}
                disabled={at < 0 || at >= wordDecks.length - 1}
                style={{ ...PC.btn, opacity: at < 0 || at >= wordDecks.length - 1 ? 0.4 : 1 }}
              >Harder</button>
              <button
                onClick={() => { BP.clearPlacement(kid.id); bump(); }}
                style={PC.btn}
              >{placed ? "Redo quick check" : "Quick check not done"}</button>
            </div>

            {wordDecks.some((d) => (by[d.id] || 0) > 0) && (
              <div style={PC.bars}>
                {wordDecks.filter((d) => (by[d.id] || 0) > 0).map((d) => (
                  <div key={d.id} style={LP.barRow}>
                    <span style={LP.barLabel}>{d.name}</span>
                    <span style={LP.barTrack}>
                      <span style={{ ...LP.barFill, width: Math.round(((by[d.id] || 0) / d.count) * 100) + "%" }} />
                    </span>
                    <span style={LP.barNum}>{(by[d.id] || 0) + "/" + d.count}</span>
                  </div>
                ))}
              </div>
            )}

            {bests.length > 0 && (
              <div style={PC.bars}>
                <div style={LP.trendLabel}>Sprint bests</div>
                {bests.map(({ d, b }) => (
                  <div key={d.id} style={LP.skillRow}>
                    <span style={LP.skillLabel}>{d.name}</span>
                    <span style={LP.skillNum}>{b.best} in {b.seconds}s</span>
                  </div>
                ))}
              </div>
            )}

            <div style={PC.line}>
              <span style={PC.lineLabel}>Sprint length</span>
              <span style={PC.stepper}>
                <button onClick={() => setting("sprintSeconds", -15, 15, 300)} style={PC.step}>-</button>
                <span style={PC.stepVal}>{set.sprintSeconds}s</span>
                <button onClick={() => setting("sprintSeconds", 15, 15, 300)} style={PC.step}>+</button>
              </span>
            </div>
            <div style={PC.line}>
              <span style={PC.lineLabel}>Question goal</span>
              <span style={PC.stepper}>
                <button onClick={() => setting("sprintTarget", -5, 5, 200)} style={PC.step}>-</button>
                <span style={PC.stepVal}>{set.sprintTarget}</span>
                <button onClick={() => setting("sprintTarget", 5, 5, 200)} style={PC.step}>+</button>
              </span>
            </div>
          </div>
        );
      })}
      <div style={LP.lessonNote}>
        Sprint is a 60-second timed round that mirrors a school fact test. It only opens once
        practice shows a kid is already fluent, and it is always beat-your-own-best - kids are
        never compared with each other. Practice itself is never timed.
      </div>
    </div>
  );
}

const PC = {
  row: {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 14, padding: "12px 13px", margin: "12px 0 0",
  },
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  name: { fontSize: 15, fontWeight: 800, color: "#F1EDFB" },
  meta: { fontSize: 12, opacity: 0.72, marginTop: 2 },
  line: { display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 13 },
  lineLabel: { opacity: 0.72, fontWeight: 700 },
  lineValue: { marginLeft: "auto", fontWeight: 800, color: "#E8E2FA" },
  btnRow: { display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0 4px" },
  btn: {
    flex: "1 1 auto", minWidth: 96, padding: "9px 10px", borderRadius: 11, cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)",
    color: "#E8E2FA", fontFamily: "inherit", fontWeight: 800, fontSize: 12.5,
  },
  bars: { display: "flex", flexDirection: "column", gap: 8, margin: "10px 0 4px" },
  stepper: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 },
  step: {
    width: 30, height: 30, borderRadius: 9, cursor: "pointer", lineHeight: 1,
    border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)",
    color: "#E8E2FA", fontFamily: "inherit", fontWeight: 900, fontSize: 16,
  },
  stepVal: { minWidth: 42, textAlign: "center", fontWeight: 800, fontSize: 13, color: "#E8E2FA" },
};

function LearningProgressCard() {
  const p = getProgress();
  const skills = subjectMastery();
  const trend = progressHistory(7);
  const earnedSet = new Set(p.badges || []);
  const attempted = p.totalCorrect + p.totalWrong;
  const weak = weakestSubject();
  const queued = reviewCount();
  const masteredCount = skills.filter((k) => k.status === "mastered").length;
  // Session LS4 - the Lessons section keeps its own mastery record; see
  // lessonsProgress() in store.js. Only lessons actually MASTERED (4 of 5) are
  // counted. Lessons the placement check merely opened are reported apart.
  const lessons = lessonsProgress();
  const SUBJECT_LABEL = { math: "Math", geometry: "Shapes", spelling: "Spelling", reading: "Reading" };

  return (
    <div style={LP.wrap}>
      <div style={LP.title}>Skills progress</div>
      <div style={LP.sub}>Follows your kid across devices when you're signed in.</div>

      <div style={LP.statRow}>
        <div style={LP.stat}>
          <div style={LP.statNum}>{masteredCount}</div>
          <div style={LP.statLabel}>Skills mastered</div>
        </div>
        <div style={LP.stat}>
          <div style={LP.statNum}>{p.streakDays}</div>
          <div style={LP.statLabel}>Day streak</div>
        </div>
        <div style={LP.stat}>
          <div style={LP.statNum}>{p.totalCorrect}</div>
          <div style={LP.statLabel}>Questions right</div>
        </div>
        <div style={LP.stat}>
          <div style={LP.statNum}>{lessons.finished}</div>
          <div style={LP.statLabel}>Lessons finished</div>
        </div>
      </div>

      {attempted > 0 && (weak || queued > 0) && (
        <div style={LP.practice}>
          {weak ? <>Practice next: <strong>{SUBJECT_LABEL[weak] || weak}</strong></> : null}
          {weak && queued > 0 ? " · " : null}
          {queued > 0 ? <>{queued} to review again</> : null}
        </div>
      )}

      {attempted === 0 ? (
        <div style={LP.empty}>No practice yet. Turn on Learning Mode above, then skills show up here.</div>
      ) : (
        <>
          <div style={LP.bars}>
            {skills.map((k) => (
              <div key={k.subject} style={LP.skillRow}>
                <span style={LP.skillLabel}>{SUBJECT_LABEL[k.subject] || k.subject}</span>
                <StatusChip status={k.status} />
                <span style={LP.skillNum}>{k.attempts ? k.pct + "%" : "—"}</span>
              </div>
            ))}
          </div>

          <div style={LP.trendLabel}>This week</div>
          <TrendBars data={trend} />
        </>
      )}

      {(lessons.finished > 0 || lessons.opened > 0) && (
        <>
          <div style={LP.trendLabel}>Lessons</div>
          {lessons.finished === 0 ? (
            <div style={LP.empty}>
              The quick check opened {lessons.opened} lesson{lessons.opened === 1 ? "" : "s"} your kid
              already knows. Nothing has been mastered yet - a lesson counts here once they get 4 of 5.
            </div>
          ) : (
            <>
              <div style={LP.lessonList}>
                {lessons.recent.map((l) => (
                  <div key={l.key} style={LP.lessonRow}>
                    <span style={LP.lessonName}>{l.title}</span>
                    <span style={LP.lessonWhen}>{l.at ? String(l.at).slice(0, 10) : ""}</span>
                  </div>
                ))}
              </div>
              {lessons.opened > 0 && (
                <div style={LP.lessonNote}>
                  Plus {lessons.opened} lesson{lessons.opened === 1 ? "" : "s"} the quick check opened
                  without needing to be taught.
                </div>
              )}
            </>
          )}
        </>
      )}

      <div style={LP.shelfLabel}>Badge shelf</div>
      <div style={LP.shelf}>
        {BADGES.map((b) => {
          const on = earnedSet.has(b.id);
          return (
            <div key={b.id} style={LP.badge} title={b.description}>
              <BadgeIcon on={on} />
              <span style={{ ...LP.badgeLabel, opacity: on ? 1 : 0.45 }}>{b.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LP = {
  wrap: {
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(155,126,221,0.3)",
    borderRadius: 16, padding: "14px 16px", margin: "14px 0",
  },
  title: { fontSize: 16, fontWeight: 800 },
  practice: { fontSize: 13, fontWeight: 700, color: "#C9B8FF", margin: "0 0 12px", textAlign: "center" },
  sub: { fontSize: 12.5, opacity: 0.75, marginTop: 3, lineHeight: 1.4 },
  statRow: { display: "flex", gap: 10, margin: "14px 0 4px" },
  stat: {
    flex: 1, textAlign: "center", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "10px 6px",
  },
  statNum: { fontFamily: FRED, fontSize: 24, fontWeight: 700, color: "#fff" },
  statLabel: { fontSize: 11.5, opacity: 0.75, marginTop: 2 },
  empty: { fontSize: 13, opacity: 0.7, lineHeight: 1.45, margin: "12px 0 4px" },
  bars: { display: "flex", flexDirection: "column", gap: 8, margin: "14px 0 4px" },
  lessonList: { display: "flex", flexDirection: "column", gap: 6, margin: "6px 0 2px" },
  lessonRow: {
    display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
  },
  lessonName: { fontSize: 13, fontWeight: 800, color: "#E8E2FA" },
  lessonWhen: { marginLeft: "auto", fontSize: 11.5, fontWeight: 700, opacity: 0.6 },
  lessonNote: { fontSize: 12, opacity: 0.7, lineHeight: 1.45, margin: "8px 0 0" },
  barRow: { display: "flex", alignItems: "center", gap: 10 },
  barLabel: { width: 70, fontSize: 13, fontWeight: 700, color: "#D8D2EC", flex: "0 0 auto" },
  barTrack: {
    flex: 1, height: 12, borderRadius: 999, background: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  barFill: {
    display: "block", height: "100%", borderRadius: 999,
    background: "linear-gradient(90deg,#8A6BFF,#E0578F)",
  },
  barNum: { width: 44, textAlign: "right", fontSize: 12, fontWeight: 700, opacity: 0.85, flex: "0 0 auto" },
  skillRow: { display: "flex", alignItems: "center", gap: 10, padding: "3px 0" },
  skillLabel: { width: 70, fontSize: 13, fontWeight: 700, color: "#D8D2EC", flex: "0 0 auto" },
  skillNum: { marginLeft: "auto", fontSize: 12.5, fontWeight: 800, opacity: 0.85, flex: "0 0 auto" },
  trendLabel: { fontSize: 12.5, fontWeight: 700, opacity: 0.85, margin: "14px 0 0" },
  shelfLabel: { fontSize: 13, fontWeight: 700, opacity: 0.9, margin: "16px 0 8px" },
  shelf: { display: "flex", flexWrap: "wrap", gap: 12 },
  badge: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 72 },
  badgeLabel: { fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.25 },
};

const LM = {
  wrap: {
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(155,126,221,0.3)",
    borderRadius: 16, padding: "14px 16px", margin: "14px 0",
  },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { fontSize: 16, fontWeight: 800 },
  sub: { fontSize: 12.5, opacity: 0.75, marginTop: 3, lineHeight: 1.4, maxWidth: 280 },
  switch: {
    flex: "0 0 auto", width: 52, height: 30, borderRadius: 999, border: "none",
    background: "rgba(255,255,255,0.22)", position: "relative", cursor: "pointer",
    padding: 0, transition: "background 0.2s",
  },
  switchOn: { background: "#00c48c" },
  knob: {
    position: "absolute", top: 3, left: 3, width: 24, height: 24, borderRadius: "50%",
    background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
  knobOn: { left: 25 },
  goalsWrap: { marginTop: 14 },
  goalsLabel: { fontSize: 13, fontWeight: 700, marginBottom: 8, opacity: 0.9 },
  goalsRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  goalBtn: {
    background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 12, padding: "8px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer",
    fontFamily: NUN,
  },
  goalBtnActive: { background: "#fff", color: "#b3477a", borderColor: "#fff" },
  ageLabel: { fontSize: 13, fontWeight: 700, margin: "14px 0 8px", opacity: 0.9 },
  ageRow: { display: "flex", alignItems: "center", gap: 12 },
  ageStep: {
    width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
  },
  ageStepOff: { opacity: 0.35, cursor: "default" },
  ageValue: {
    minWidth: 84, textAlign: "center", display: "flex", flexDirection: "column",
    alignItems: "center", lineHeight: 1,
  },
  ageNum: { fontFamily: FRED, fontSize: 26, fontWeight: 700, color: "#fff" },
  ageUnit: { fontSize: 11.5, opacity: 0.7, marginTop: 2 },
  ageHint: { fontSize: 12, opacity: 0.7, marginTop: 8, lineHeight: 1.4 },
  gradeBtn: {
    background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 12, padding: "8px 12px", minWidth: 40, fontSize: 14, fontWeight: 800,
    cursor: "pointer", fontFamily: NUN,
  },
  momentsHint: { fontSize: 12, opacity: 0.7, margin: "0 0 8px", lineHeight: 1.4 },
  momentRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "8px 0" },
  momentLabel: { fontSize: 13.5, fontWeight: 600, opacity: 0.95, flex: 1 },
  triWrap: { display: "inline-flex", flex: "0 0 auto", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.22)" },
  triBtn: {
    background: "transparent", color: "#fff", border: "none", borderLeft: "1px solid rgba(255,255,255,0.18)",
    padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: NUN,
  },
  triBtnActive: { background: "#fff", color: "#b3477a" },
};

const S = {
  container: {
    minHeight: "100vh", background: "#120C22", color: "#fff",
    fontFamily: NUN, padding: "20px 16px 60px", boxSizing: "border-box",
  },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  backBtn: {
    background: "rgba(255,255,255,0.10)", color: "#fff", border: "none",
    borderRadius: 999, padding: "8px 16px", fontSize: 15, fontWeight: 700,
    cursor: "pointer", fontFamily: NUN,
  },
  logo: {
    fontFamily: FRED, fontWeight: 700, fontSize: 24, textAlign: "center",
    margin: "10px 0 2px",
    background: "linear-gradient(90deg, #9B7CFF, #E87BB0)",
    WebkitBackgroundClip: "text", backgroundClip: "text",
    WebkitTextFillColor: "transparent", color: "transparent",
  },
  title: { fontFamily: FRED, fontSize: 28, fontWeight: 600, textAlign: "center", margin: "10px 0 16px" },
  card: {
    maxWidth: 460, margin: "0 auto", background: CARD_BG, border: CARD_BORDER,
    borderRadius: 22, padding: 22,
  },
  lead: { fontSize: 16, lineHeight: 1.45, textAlign: "center", margin: "0 0 16px", color: "#D8D2EC" },
  muted: { fontSize: 14, textAlign: "center", color: "#9C93BC", margin: "12px 0" },
  fineprint: { fontSize: 12, textAlign: "center", color: "#8C84A8", margin: "14px 0 0", lineHeight: 1.4 },
  warn: {
    fontSize: 13, lineHeight: 1.4, color: "#FFE2A6",
    background: "rgba(255,200,90,0.12)",
    border: "1px solid rgba(255,200,90,0.32)", borderRadius: 12, padding: "10px 12px", margin: "0 0 14px",
  },
  googleBtn: {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#fff", color: "#3c4043", border: "none", borderRadius: 999,
    padding: "14px 18px", fontSize: 16, fontWeight: 800, cursor: "pointer",
    fontFamily: NUN, marginTop: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  },
  primaryBig: {
    width: "100%", background: GRAD_BTN, color: "#fff", border: "none",
    borderRadius: 999, padding: "14px 18px", fontSize: 17, fontWeight: 700,
    cursor: "pointer", fontFamily: FRED, marginTop: 10,
  },
  secondaryBig: {
    width: "100%", background: "rgba(255,255,255,0.08)", color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "13px 18px",
    fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: NUN, marginTop: 10,
  },
  ghostBig: {
    width: "100%", background: "transparent", color: "#fff",
    border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "12px 18px",
    fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: NUN, marginTop: 10,
  },
  divider: { display: "flex", alignItems: "center", margin: "16px 0", opacity: 0.5 },
  dividerText: {
    margin: "0 auto", fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#9C93BC",
  },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 700, color: "#D8D2EC" },
  input: {
    width: "100%", boxSizing: "border-box", borderRadius: 12, border: "none",
    padding: "12px 14px", fontSize: 16, fontFamily: NUN, color: "#333",
  },
  linkBtn: {
    display: "block", width: "100%", background: "none", color: "#C9A0E8",
    border: "none", textDecoration: "underline", fontSize: 14, fontWeight: 700,
    cursor: "pointer", marginTop: 14, fontFamily: NUN,
  },
  error: {
    color: "#ffd7d7", background: "rgba(180,40,40,0.25)", borderRadius: 10,
    padding: "8px 12px", fontSize: 14, margin: "10px 0 0",
  },
  noticeBox: {
    color: "#eafff0", background: "rgba(40,160,90,0.22)", borderRadius: 10,
    padding: "8px 12px", fontSize: 14, margin: "10px 0 0", lineHeight: 1.4,
  },
  // QA53 — the Rename/Remove pills used to run together into one long strip
  // under a row of children, so you could not tell which pair belonged to which
  // child. The track was 96px wide and the two pills need more than that, so
  // they spilled out of their own cell. Widen the track to fit the pair, and put
  // each child on their own tinted card so the pairing is unmistakable.
  kidGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(138px, 1fr))",
    gap: 12, margin: "6px 0 16px", justifyItems: "stretch",
  },
  kidManageWrap: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 18, padding: "12px 8px",
  },
  kidWrap: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    background: "transparent", border: "none", cursor: "pointer", color: "#fff",
    fontFamily: NUN, padding: 0,
  },
  kidAvatar: {
    width: 72, height: 72, borderRadius: "50%", display: "flex",
    alignItems: "center", justifyContent: "center", fontFamily: FRED,
    fontSize: "clamp(20px, 5vw, 30px)", fontWeight: 600, color: "#fff",
    boxShadow: "0 8px 18px rgba(0,0,0,0.4)",
  },
  kidName: { fontSize: 14, fontWeight: 700, maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  kidActions: { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" },
  miniBtn: {
    background: "rgba(255,255,255,0.10)", color: "#fff", border: "none", borderRadius: 999,
    padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: NUN,
  },
  miniBtnDanger: {
    background: "rgba(225,90,90,0.18)", color: "#FFC9C9", border: "none", borderRadius: 999,
    padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: NUN,
  },
  addRow: { display: "flex", flexDirection: "column", gap: 10, marginTop: 6 },
  avatarRow: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  colorPick: {
    width: 34, height: 34, borderRadius: "50%", border: "2px solid transparent",
    cursor: "pointer", padding: 0,
  },
  colorPickActive: { border: "2px solid #fff", boxShadow: "0 0 0 2px rgba(255,255,255,0.35)" },
  avatarPick: { padding: 3, borderRadius: "50%", border: "2px solid transparent", background: "transparent", cursor: "pointer", lineHeight: 0 },
  avatarPickActive: { border: "2px solid #fff", boxShadow: "0 0 0 2px rgba(255,255,255,0.35)" },
  gradePick: { minWidth: 40, padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: NUN },
  gradePickActive: { background: "#fff", color: "#b3477a", borderColor: "#fff" },
  fieldLabel: { fontSize: 12.5, fontWeight: 700, opacity: 0.85, margin: "6px 0 2px", textAlign: "center" },
  projList: { display: "flex", flexDirection: "column", gap: 8, margin: "6px 0 14px" },
  projRow: {
    display: "flex", alignItems: "center", gap: 10,
    background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "8px 10px",
  },
  projIcon: { display: "flex", alignItems: "center" },
  projIconBox: {
    width: 30, height: 30, borderRadius: 9, display: "flex",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  projTitle: { flex: 1, fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  select: {
    borderRadius: 10, border: "none", padding: "6px 8px", fontSize: 13,
    fontFamily: NUN, color: "#333", maxWidth: 150,
  },
};
