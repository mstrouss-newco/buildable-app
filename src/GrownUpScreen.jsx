// /src/GrownUpScreen.jsx
// -------------------------------------------------------------
// "Who's playing?" — ZERO-AUTH profile picker.
//
// This build has NO accounts and NO login. Earlier this screen gated
// everything behind a parent email/password sign-in, and adding a kid
// hit Supabase Auth, which failed with "This endpoint requires a valid
// Bearer token." That gate is gone.
//
// Now: kids are shown the profile picker straight away. Profiles are
// stored on the device (src/lib/accounts.js, localStorage). Songs/games
// still save to the central library via the existing service-key API.
// -------------------------------------------------------------
import { useState, useEffect } from "react";
import {
  listKidProfiles, createKidProfile, renameKidProfile, deleteKidProfile,
  setActiveKid, getActiveKid,
} from "./lib/accounts";

const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const CARD_BG = "rgba(255,255,255,0.05)";
const CARD_BORDER = "1px solid rgba(155,126,221,0.22)";

const AVATARS = ["🦄", "🐯", "🐸", "🐙", "🐵", "🦊", "🐶", "🐼", "🐢", "🐝", "🌟", "🚀"];

export default function GrownUpScreen({ onBack, onProfileChosen }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [kids, setKids] = useState([]);
  const [loadingKids, setLoadingKids] = useState(true);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState(AVATARS[0]);
  const [active, setActive] = useState(getActiveKid());

  async function refreshKids() {
    setLoadingKids(true);
    try { setKids(await listKidProfiles()); }
    catch (e) { setError(e.message); }
    finally { setLoadingKids(false); }
  }

  useEffect(() => { refreshKids(); }, []);

  async function handleAddKid(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    try {
      await createKidProfile(newName.trim(), newAvatar);
      setNewName("");
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

  async function handleDelete(kid) {
    const ok = window.confirm("Remove " + (kid.display_name || "this profile") + " from this device? Their saved songs stay in the library.");
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      await deleteKidProfile(kid.id);
      if (active && active.id === kid.id) setActive(null);
      await refreshKids();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={S.container}>
      <div style={S.topRow}>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
      </div>

      <div style={S.iconBig}>👨‍👩‍👧</div>
      <h1 style={S.title}>Who's playing?</h1>

      <div style={S.card}>
        <p style={S.muted}>
          Pick your tile to start. Your songs and games are saved for you on this
          device — no login needed.
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
                  onClick={() => handleDelete(k)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddKid} style={S.addBox}>
          <h3 style={S.h3}>Add a kid profile</h3>
          <div style={S.avatarRow}>
            {AVATARS.map((a) => (
              <button type="button" key={a}
                onClick={() => setNewAvatar(a)}
                style={{ ...S.avatarPick, ...(newAvatar === a ? S.avatarPickActive : {}) }}>{a}</button>
            ))}
          </div>
          <input style={S.input} placeholder="Kid's first name" value={newName}
            onChange={(e) => setNewName(e.target.value)} />
          {error && <p style={S.error}>{error}</p>}
          <button style={S.primary} type="submit" disabled={busy}>Add profile</button>
        </form>
      </div>
    </div>
  );
}

const S = {
  container: { minHeight: "100vh", padding: "24px 20px 60px", fontFamily: NUN, color: "#fff",
    display: "flex", flexDirection: "column", alignItems: "center" },
  topRow: { width: "100%", maxWidth: "520px", display: "flex", justifyContent: "space-between", marginBottom: "10px" },
  backBtn: { background: CARD_BG, border: CARD_BORDER, color: "#fff", borderRadius: "12px",
    padding: "8px 14px", fontFamily: NUN, fontWeight: 700, cursor: "pointer" },
  iconBig: { fontSize: "56px", marginTop: "8px" },
  title: { fontFamily: FRED, fontSize: "34px", margin: "6px 0 18px" },
  card: { width: "100%", maxWidth: "440px", background: CARD_BG, border: CARD_BORDER,
    borderRadius: "20px", padding: "22px", display: "flex", flexDirection: "column", gap: "12px" },
  h2: { fontFamily: FRED, fontSize: "22px", margin: 0 },
  h3: { fontFamily: FRED, fontSize: "18px", margin: "4px 0" },
  muted: { color: "rgba(255,255,255,0.7)", fontSize: "14px", lineHeight: 1.5, margin: 0 },
  input: { padding: "12px 14px", borderRadius: "12px", border: CARD_BORDER,
    background: "rgba(0,0,0,0.25)", color: "#fff", fontFamily: NUN, fontSize: "16px" },
  primary: { background: GRAD, border: "none", color: "#fff", borderRadius: "14px",
    padding: "13px", fontFamily: FRED, fontSize: "17px", fontWeight: 700, cursor: "pointer" },
  linkBtn: { background: "none", border: "none", color: "#c9b3ff", cursor: "pointer",
    fontFamily: NUN, fontWeight: 700, fontSize: "14px" },
  error: { color: "#ff9bb0", fontSize: "14px", margin: 0 },
  kidGrid: { display: "flex", flexWrap: "wrap", gap: "12px" },
  kidWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" },
  kidTile: { width: "92px", height: "104px", borderRadius: "18px", background: "rgba(0,0,0,0.25)",
    border: CARD_BORDER, color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: "6px" },
  kidTileActive: { border: "2px solid #d65a7b", background: "rgba(214,90,123,0.18)" },
  kidAvatar: { fontSize: "34px" },
  kidName: { fontFamily: NUN, fontWeight: 700, fontSize: "14px" },
  kidActions: { display: "flex", gap: "6px" },
  miniBtn: { background: "rgba(0,0,0,0.25)", border: CARD_BORDER, color: "#fff", borderRadius: "10px",
    width: "34px", height: "30px", cursor: "pointer", fontSize: "13px", flexShrink: 0 },
  addBox: { marginTop: "6px", paddingTop: "14px", borderTop: CARD_BORDER,
    display: "flex", flexDirection: "column", gap: "10px" },
  avatarRow: { display: "flex", flexWrap: "wrap", gap: "8px" },
  avatarPick: { fontSize: "24px", width: "44px", height: "44px", borderRadius: "12px",
    background: "rgba(0,0,0,0.25)", border: CARD_BORDER, cursor: "pointer" },
  avatarPickActive: { border: "2px solid #d65a7b", background: "rgba(214,90,123,0.18)" },
};
