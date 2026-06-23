// /src/GrownUpScreen.jsx
// -------------------------------------------------------------
// Grown-ups area: a proper, dedicated account flow.
//
// This screen is a guided, multi-STEP flow (not a single cramped panel):
//
//   STEP "choose"   -> pick a lane: create/sign in to a parent account,
//                       or continue without an account (guest, this device).
//   STEP "auth"     -> parent signs up or signs in (Supabase Auth).
//   STEP "kids"     -> create + manage kid profiles (tap-a-tile, no kid
//                       passwords). Choosing a tile starts play for that kid.
//   STEP "projects" -> assign existing creations (songs/games) to a kid so
//                       a parent can keep each child's stuff organized.
//
// All data access goes through src/lib/accounts.js, which branches between
// the guest (device) store and the account (Supabase) store. The agent
// never creates accounts or types passwords -- the grown-up does that.
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
} from "./lib/accounts";

const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const CARD_BG = "rgba(255,255,255,0.05)";
const CARD_BORDER = "1px solid rgba(155,126,221,0.22)";

const AVATARS = ["🦄", "🐯", "🐸", "🐙", "🐵", "🦊", "🐶", "🐼", "🐢", "🐝", "🌟", "🚀"];

export default function GrownUpScreen({ onBack, onProfileChosen }) {
  // Flow steps. Start on the kid picker when already signed in (returning
  // parent); otherwise start on the lane chooser.
  const [step, setStep] = useState(isSignedIn() ? "kids" : "choose");

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
  const [newAvatar, setNewAvatar] = useState(AVATARS[0]);
  const [active, setActive] = useState(getActiveKid());

  // projects (assign-to-kid)
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const configured = isConfigured();

  async function refreshKids() {
    setLoadingKids(true);
    try { setKids(await listKidProfiles()); }
    catch (e) { setError(e.message); }
    finally { setLoadingKids(false); }
  }

  useEffect(() => { refreshKids(); }, [signedIn]);

  async function refreshProjects() {
    setLoadingProjects(true);
    try { setProjects(await listFamilyProjects()); }
    catch (e) { setError(e.message); }
    finally { setLoadingProjects(false); }
  }

  // ---- auth ----
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
      setStep("kids");
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
      await createKidProfile(newName.trim(), newAvatar);
      setNewName("");
      setNewAvatar(AVATARS[0]);
      await refreshKids();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function chooseKid(kid) {
    setActiveKid(kid);
    setActive(kid);
    if (onProfileChosen) onProfileChosen(kid);
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
      await assignProjectToKid(project.kind, project.projectId, kidProfileId || null);
      await refreshProjects();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function kidName(id) {
    const k = kids.find((x) => x.id === id);
    return k ? (k.avatar ? k.avatar + " " : "") + k.display_name : "Unassigned";
  }

  // -------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------
  return (
    <div style={S.container}>
      <div style={S.topRow}>
        <button onClick={step === "choose" || !signedIn ? onBack : () => setStep("kids")}
          style={S.backBtn}>← Back</button>
        {signedIn && <button onClick={handleSignOut} style={S.backBtn}>Sign out</button>}
      </div>

      <div style={S.iconBig}>👨‍👩‍👧</div>

      {/* STEP: choose a lane ------------------------------------- */}
      {step === "choose" && !signedIn && (
        <>
          <h1 style={S.title}>Grown-ups</h1>
          <div style={S.card}>
            <p style={S.lead}>Set up the family — your kids' creations follow them on any device.</p>
            {!configured && (
              <p style={S.warn}>
                Accounts aren't switched on for this site yet. You can still play as a
                guest below; a grown-up can enable accounts in the site settings.
              </p>
            )}
            <button style={S.primaryBig} disabled={!configured}
              onClick={() => { setMode("signup"); setStep("auth"); }}>
              ✨ Create a parent account
            </button>
            <button style={S.secondaryBig} disabled={!configured}
              onClick={() => { setMode("signin"); setStep("auth"); }}>
              I already have an account
            </button>
            <div style={S.divider}><span style={S.dividerText}>or</span></div>
            <button style={S.ghostBig} onClick={() => setStep("kids")}>
              Continue without an account
            </button>
            <p style={S.fineprint}>
              Guest mode keeps profiles on this device only. No login, nothing leaves
              this device's library.
            </p>
          </div>
        </>
      )}

      {/* STEP: parent auth --------------------------------------- */}
      {step === "auth" && !signedIn && (
        <>
          <h1 style={S.title}>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <div style={S.card}>
            <p style={S.lead}>
              {mode === "signup"
                ? "One grown-up login for the whole family. Kids never need a password."
                : "Sign in to load your kids' profiles and creations."}
            </p>
            <form onSubmit={handleAuth} style={S.form}>
              <label style={S.label}>Email
                <input style={S.input} type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" />
              </label>
              <label style={S.label}>Password
                <input style={S.input} type="password"
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

      {/* STEP: kid profiles -------------------------------------- */}
      {(step === "kids" || (signedIn && step === "auth")) && (
        <>
          <h1 style={S.title}>Who's playing?</h1>
          <div style={S.card}>
            <p style={S.lead}>
              {signedIn
                ? "Signed in — your kids' creations follow them on any device."
                : "Pick a tile to start — no login needed. Saved on this device."}
            </p>

            {loadingKids && <p style={S.muted}>Loading profiles…</p>}

            <div style={S.kidGrid}>
              {kids.map((k) => (
                <div key={k.id} style={S.kidWrap}>
                  <button onClick={() => chooseKid(k)}
                    style={{ ...S.kidTile, ...(active && active.id === k.id ? S.kidTileActive : {}) }}>
                    <span style={S.kidAvatar}>{k.avatar || "🙂"}</span>
                    <span style={S.kidName}>{k.display_name}</span>
                  </button>
                  <div style={S.kidActions}>
                    <button type="button" style={S.miniBtn} title="Rename"
                      onClick={() => handleRename(k)}>✏️</button>
                    <button type="button" style={S.miniBtn} title="Remove"
                      onClick={() => handleDeleteKid(k)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>

            {!loadingKids && kids.length === 0 && (
              <p style={S.muted}>No profiles yet — add your first child below.</p>
            )}

            <form onSubmit={handleAddKid} style={S.addRow}>
              <input style={S.input} value={newName} maxLength={40}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Add a child's name" />
              <div style={S.avatarRow}>
                {AVATARS.map((a) => (
                  <button type="button" key={a}
                    onClick={() => setNewAvatar(a)}
                    style={{ ...S.avatarPick, ...(newAvatar === a ? S.avatarPickActive : {}) }}>
                    {a}
                  </button>
                ))}
              </div>
              <button type="submit" style={S.primaryBig} disabled={busy || !newName.trim()}>
                ＋ Add child
              </button>
            </form>

            {error && <p style={S.error}>{error}</p>}

            {signedIn && (
              <button style={S.linkBtn} onClick={goProjects}>
                🎵 Organize creations by child →
              </button>
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
                  <span style={S.projIcon}>{p.kind === "game" ? "🎮" : "🎵"}</span>
                  <span style={S.projTitle}>{p.title}</span>
                  <select style={S.select} disabled={busy}
                    value={p.kidProfileId || ""}
                    onChange={(e) => handleAssign(p, e.target.value || null)}>
                    <option value="">Unassigned</option>
                    {kids.map((k) => (
                      <option key={k.id} value={k.id}>
                        {(k.avatar ? k.avatar + " " : "") + k.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {error && <p style={S.error}>{error}</p>}
            <button style={S.ghostBig} onClick={() => setStep("kids")}>← Back to profiles</button>
          </div>
        </>
      )}
    </div>
  );
}

const S = {
  container: {
    minHeight: "100vh", background: GRAD, color: "#fff",
    fontFamily: NUN, padding: "20px 16px 60px", boxSizing: "border-box",
  },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  backBtn: {
    background: "rgba(255,255,255,0.12)", color: "#fff", border: "none",
    borderRadius: 14, padding: "8px 16px", fontSize: 15, fontWeight: 700,
    cursor: "pointer", fontFamily: NUN,
  },
  iconBig: { fontSize: 56, textAlign: "center", marginTop: 8 },
  title: { fontFamily: FRED, fontSize: 30, fontWeight: 700, textAlign: "center", margin: "6px 0 14px" },
  card: {
    maxWidth: 460, margin: "0 auto", background: CARD_BG, border: CARD_BORDER,
    borderRadius: 22, padding: 22,
  },
  lead: { fontSize: 16, lineHeight: 1.45, textAlign: "center", margin: "0 0 16px", opacity: 0.95 },
  muted: { fontSize: 14, textAlign: "center", opacity: 0.7, margin: "12px 0" },
  fineprint: { fontSize: 12, textAlign: "center", opacity: 0.6, margin: "12px 0 0", lineHeight: 1.4 },
  warn: {
    fontSize: 13, lineHeight: 1.4, background: "rgba(255,210,120,0.14)",
    border: "1px solid rgba(255,210,120,0.4)", borderRadius: 12, padding: "10px 12px", margin: "0 0 14px",
  },
  primaryBig: {
    width: "100%", background: "#fff", color: "#b3477a", border: "none",
    borderRadius: 16, padding: "14px 18px", fontSize: 17, fontWeight: 800,
    cursor: "pointer", fontFamily: FRED, marginTop: 8,
  },
  secondaryBig: {
    width: "100%", background: "rgba(255,255,255,0.16)", color: "#fff",
    border: "1px solid rgba(255,255,255,0.3)", borderRadius: 16, padding: "13px 18px",
    fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: NUN, marginTop: 10,
  },
  ghostBig: {
    width: "100%", background: "transparent", color: "#fff",
    border: "1px solid rgba(255,255,255,0.35)", borderRadius: 16, padding: "12px 18px",
    fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: NUN, marginTop: 10,
  },
  divider: { display: "flex", alignItems: "center", margin: "16px 0", opacity: 0.6 },
  dividerText: {
    margin: "0 auto", fontSize: 13, textTransform: "uppercase", letterSpacing: 1,
  },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 700 },
  input: {
    width: "100%", boxSizing: "border-box", borderRadius: 12, border: "none",
    padding: "12px 14px", fontSize: 16, fontFamily: NUN, color: "#333",
  },
  linkBtn: {
    display: "block", width: "100%", background: "none", color: "#fff",
    border: "none", textDecoration: "underline", fontSize: 14, fontWeight: 700,
    cursor: "pointer", marginTop: 14, fontFamily: NUN, opacity: 0.95,
  },
  error: {
    color: "#ffd7d7", background: "rgba(180,40,40,0.25)", borderRadius: 10,
    padding: "8px 12px", fontSize: 14, margin: "10px 0 0",
  },
  noticeBox: {
    color: "#eafff0", background: "rgba(40,160,90,0.22)", borderRadius: 10,
    padding: "8px 12px", fontSize: 14, margin: "10px 0 0", lineHeight: 1.4,
  },
  kidGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
    gap: 12, margin: "6px 0 16px",
  },
  kidWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  kidTile: {
    width: "100%", aspectRatio: "1", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 4,
    background: "rgba(255,255,255,0.1)", border: "2px solid transparent",
    borderRadius: 18, cursor: "pointer", color: "#fff", fontFamily: NUN,
  },
  kidTileActive: { border: "2px solid #fff", background: "rgba(255,255,255,0.22)" },
  kidAvatar: { fontSize: 34 },
  kidName: { fontSize: 13, fontWeight: 700, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  kidActions: { display: "flex", gap: 6 },
  miniBtn: {
    background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 8,
    padding: "2px 6px", fontSize: 13, cursor: "pointer",
  },
  addRow: { display: "flex", flexDirection: "column", gap: 10, marginTop: 6 },
  avatarRow: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  avatarPick: {
    background: "rgba(255,255,255,0.1)", border: "2px solid transparent",
    borderRadius: 10, padding: "4px 6px", fontSize: 20, cursor: "pointer",
  },
  avatarPickActive: { border: "2px solid #fff", background: "rgba(255,255,255,0.22)" },
  projList: { display: "flex", flexDirection: "column", gap: 8, margin: "6px 0 14px" },
  projRow: {
    display: "flex", alignItems: "center", gap: 10,
    background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "8px 10px",
  },
  projIcon: { fontSize: 20 },
  projTitle: { flex: 1, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  select: {
    borderRadius: 10, border: "none", padding: "6px 8px", fontSize: 13,
    fontFamily: NUN, color: "#333", maxWidth: 150,
  },
};
