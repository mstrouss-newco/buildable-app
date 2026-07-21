// /src/lib/shareSheet.js
// One tiny helper that powers every "Share" button in the app.
//
// It builds a private, read-only link to a saved story or song, then:
//   1) On phones/tablets it opens the device's NATIVE share sheet (Messages, Mail,
//      WhatsApp, Instagram, AirDrop, etc.) via the Web Share API.
//   2) On computers (no share sheet) it pops a small menu with Copy link, Email,
//      Text, WhatsApp, Facebook and X — and copies the link to the clipboard.
//
// Links look like:  https://your-site/s/story_abc   (or /p/song_abc)
// Short /s/:id links are served by api/story-share.js, which injects a rich link
// preview (title + cover image) then renders the same read-only viewer
// (public/story.html). Songs use the /p/:id pretty route to song.html.

function shareUrl(kind, id) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const path = kind === "song" ? "/p/" : "/s/";
  return origin + path + encodeURIComponent(id);
}

function shareText(kind, title) {
  const name = title || (kind === "song" ? "my song" : "my story");
  return kind === "song"
    ? `Listen to "${name}" — a song I made on Buildable Kids!`
    : `Read "${name}" — a story I made on Buildable Kids!`;
}

export async function shareCreation({ kind, id, title }) {
  if (!id) {
    alert("Save it first, then you can share it!");
    return;
  }
  const url = shareUrl(kind, id);
  const text = shareText(kind, title);

  // 1) Native share sheet (covers text, email, social on phones).
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: title || "Buildable Kids", text, url });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // user closed the sheet
      // otherwise fall through to the menu
    }
  }

  // 2) Desktop fallback menu.
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(url);
  } catch {}
  openFallbackMenu({ url, text });
}

function openFallbackMenu({ url, text }) {
  // Remove any previous menu.
  const old = document.getElementById("bk-share-overlay");
  if (old) old.remove();

  const enc = encodeURIComponent;
  const links = [
    { label: "Copy link", href: null, action: "copy" },
    { label: "Email", href: `mailto:?subject=${enc("A Buildable Kids creation")}&body=${enc(text + "\n\n" + url)}` },
    { label: "Text message", href: `sms:?&body=${enc(text + " " + url)}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${enc(text + " " + url)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
  ];

  const overlay = document.createElement("div");
  overlay.id = "bk-share-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(15,14,23,.6);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:'Nunito',-apple-system,sans-serif;";
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  const card = document.createElement("div");
  card.style.cssText =
    "background:#fff;color:#1F2937;border-radius:20px;padding:22px;width:min(360px,92vw);box-shadow:0 24px 70px rgba(0,0,0,.45);";
  card.innerHTML =
    '<div style="font-weight:900;font-size:19px;margin-bottom:4px;">Share this</div>' +
    '<div style="font-size:13px;color:#6B7280;margin-bottom:14px;word-break:break-all;">' + url + "</div>";

  links.forEach((l) => {
    const b = document.createElement(l.href ? "a" : "button");
    if (l.href) { b.href = l.href; b.target = "_blank"; b.rel = "noopener noreferrer"; }
    b.textContent = l.label;
    b.style.cssText =
      "display:block;width:100%;text-align:left;box-sizing:border-box;margin:8px 0;padding:13px 16px;border:none;border-radius:14px;background:#F3EFFE;color:#5B21B6;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer;text-decoration:none;";
    b.addEventListener("click", async () => {
      if (l.action === "copy") {
        try { await navigator.clipboard.writeText(url); b.textContent = "Copied!"; } catch {}
        return;
      }
      setTimeout(() => overlay.remove(), 150);
    });
    card.appendChild(b);
  });

  const close = document.createElement("button");
  close.textContent = "Close";
  close.style.cssText =
    "display:block;width:100%;margin-top:8px;padding:11px;border:none;border-radius:14px;background:#F3F4F6;color:#6B7280;font-weight:800;font-size:14px;font-family:inherit;cursor:pointer;";
  close.addEventListener("click", () => overlay.remove());
  card.appendChild(close);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}
