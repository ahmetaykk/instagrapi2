const API_PORTS = [8000, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010];
let API = "http://localhost:8000";

(async function detectAPI() {
  for (const port of API_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}/me`, { method: "GET", signal: AbortSignal.timeout(800) });
      if (res.status === 200 || res.status === 401) {
        API = `http://localhost:${port}`;
        return;
      }
    } catch {}
  }
})();

const DOWNLOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const CHECK_SVG    = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
const X_SVG        = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

function setBtnState(btn, state, msg) {
  btn.classList.remove("igdl-loading","igdl-done","igdl-error");
  if (state === "loading") { btn.classList.add("igdl-loading"); btn.innerHTML = '<span class="igdl-spin"></span>'; }
  else if (state === "done")  { btn.classList.add("igdl-done");  btn.innerHTML = CHECK_SVG; }
  else if (state === "error") { btn.classList.add("igdl-error"); btn.innerHTML = X_SVG; if (msg) btn.title = msg; }
  else { btn.innerHTML = DOWNLOAD_SVG; }
}
function resetBtn(btn) {
  setTimeout(() => { btn.classList.remove("igdl-done","igdl-error"); btn.innerHTML = DOWNLOAD_SVG; btn.title = "İndir"; }, 2500);
}
async function doDownload(url, btn) {
  setBtnState(btn, "loading");
  try {
    const r = await fetch(API + "/download/post", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "Hata");
    setBtnState(btn, "done");
  } catch (e) { setBtnState(btn, "error", e.message); }
  resetBtn(btn);
}

function getPostUrl(root) {
  const a = root.querySelector("a[href*='/p/'], a[href*='/reel/']");
  if (a) return "https://www.instagram.com" + a.getAttribute("href").split("?")[0];
  const m = location.href.match(/instagram\.com\/(p|reel|reels)\/([^/?]+)/);
  if (m) return "https://www.instagram.com/" + (m[1]==="reels"?"reel":m[1]) + "/" + m[2] + "/";
  return null;
}

function makeBtn(extraClass) {
  const btn = document.createElement("button");
  btn.className = "igdl-btn" + (extraClass ? " " + extraClass : "");
  btn.innerHTML = DOWNLOAD_SVG;
  btn.title = "İndir";
  return btn;
}

// Bookmark butonunu bul ve yanına indirme butonu ekle
// Bookmark'ın parent'ını flex row'a zorla
function insertNextToBookmark(root, btn) {
  const SAVE_LABELS = ["Kaydet","Save","Kaydedildi","Saved","Remove","Kaldır"];
  for (const label of SAVE_LABELS) {
    const svg = root.querySelector(`svg[aria-label="${label}"]`);
    if (!svg) continue;
    const bookmarkBtn = svg.closest("button, div[role='button']");
    if (!bookmarkBtn) continue;
    const parent = bookmarkBtn.parentElement;
    if (!parent) continue;

    // Parent'ı flex row'a zorla ve overflow'u aç
    parent.style.cssText += ";display:flex!important;flex-direction:row!important;align-items:center!important;overflow:visible!important;";

    // Zaten eklenmiş mi?
    if (parent.querySelector(".igdl-btn")) return true;

    parent.insertBefore(btn, bookmarkBtn.nextSibling);
    return true;
  }
  return false;
}

// ── FEED article'ları ─────────────────────────────────────────
function processArticle(article) {
  if (article.hasAttribute("data-igdl-done")) return;
  article.setAttribute("data-igdl-done", "true");

  const postUrl = getPostUrl(article);
  if (!postUrl) return;

  const btn = makeBtn();
  btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); doDownload(postUrl, btn); });

  // Önce bookmark yanına koymayı dene
  if (insertNextToBookmark(article, btn)) return;

  // Strateji 2: section içindeki buton grubunu bul
  const sections = article.querySelectorAll("section");
  for (const section of sections) {
    const btns = section.querySelectorAll("button, div[role='button']");
    if (btns.length >= 2) {
      // section'ı flex row'a zorla
      section.style.cssText += ";display:flex!important;flex-direction:row!important;align-items:center!important;overflow:visible!important;";
      if (!section.querySelector(".igdl-btn")) section.appendChild(btn);
      return;
    }
  }

  // Fallback: absolute overlay
  btn.classList.add("igdl-abs");
  article.style.position = "relative";
  article.appendChild(btn);
}

// ── Tek post / modal ──────────────────────────────────────────
function processPostPage() {
  const m = location.href.match(/instagram\.com\/(p|reel)\/([^/?]+)/);
  if (!m) return;
  const postUrl = `https://www.instagram.com/${m[1]}/${m[2]}/`;

  // Modal dialog veya article
  document.querySelectorAll("[role='dialog'], article").forEach(container => {
    if (container.hasAttribute("data-igdl-post")) return;
    if (!container.querySelector("svg[aria-label='Kaydet'], svg[aria-label='Save'], svg[aria-label='Kaydedildi'], svg[aria-label='Saved']")) return;
    container.setAttribute("data-igdl-post", "true");

    const btn = makeBtn();
    btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); doDownload(postUrl, btn); });
    insertNextToBookmark(container, btn);
  });
}

// ── REELS sayfası ─────────────────────────────────────────────
function processReels() {
  if (!location.href.match(/instagram\.com\/reels?\//)) return;

  const m = location.href.match(/instagram\.com\/reels?\/([^/?]+)/);
  const postUrl = m ? `https://www.instagram.com/reel/${m[1]}/` : null;
  if (!postUrl) return;

  document.querySelectorAll("video:not([data-igdl-reel])").forEach(video => {
    video.setAttribute("data-igdl-reel", "true");

    // Viewport yüksekliğinin %50'sinden büyük container'ı bul
    let container = video.parentElement;
    for (let i = 0; i < 20; i++) {
      if (!container || container === document.body) break;
      if (container.offsetHeight > window.innerHeight * 0.5 && container.offsetWidth > 100) break;
      container = container.parentElement;
    }
    if (!container || container === document.body) container = video.parentElement;
    if (container.querySelector(".igdl-reel-overlay")) return;

    const btn = makeBtn("igdl-reel-overlay");
    btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); doDownload(postUrl, btn); });
    container.style.position = "relative";
    container.appendChild(btn);
  });
}

function scanAll() {
  document.querySelectorAll("article:not([data-igdl-done])").forEach(processArticle);
  processPostPage();
  processReels();
}

// ── Stiller ───────────────────────────────────────────────────
const style = document.createElement("style");
style.textContent = `
  .igdl-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 40px !important;
    height: 40px !important;
    min-width: 40px !important;
    border: none !important;
    background: transparent !important;
    cursor: pointer !important;
    border-radius: 50% !important;
    color: inherit !important;
    padding: 0 !important;
    flex-shrink: 0 !important;
    transition: transform 0.15s, opacity 0.15s;
    visibility: visible !important;
    opacity: 1 !important;
    box-sizing: border-box !important;
  }
  .igdl-btn:hover { transform: scale(1.12) !important; opacity: 0.7 !important; }
  .igdl-btn.igdl-done  svg { stroke: #22c55e !important; }
  .igdl-btn.igdl-error svg { stroke: #ef4444 !important; }

  /* Reels overlay */
  .igdl-reel-overlay {
    position: absolute !important;
    bottom: 80px !important;
    right: 16px !important;
    z-index: 99999 !important;
    width: 48px !important;
    height: 48px !important;
    min-width: 48px !important;
    background: rgba(0,0,0,0.6) !important;
    border-radius: 50% !important;
    box-shadow: 0 2px 16px rgba(0,0,0,0.5) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .igdl-reel-overlay svg { stroke: white !important; }
  .igdl-reel-overlay:hover {
    background: rgba(0,0,0,0.85) !important;
    transform: scale(1.1) !important;
    opacity: 1 !important;
  }

  /* Absolute fallback */
  .igdl-abs {
    position: absolute !important;
    bottom: 10px !important;
    right: 10px !important;
    z-index: 99999 !important;
    width: 36px !important;
    height: 36px !important;
    background: rgba(255,255,255,0.92) !important;
    backdrop-filter: blur(6px) !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.28) !important;
    border-radius: 50% !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .igdl-abs svg { stroke: #111 !important; }

  .igdl-spin {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(128,128,128,0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: igdl-spin 0.7s linear infinite;
    display: inline-block;
  }
  .igdl-reel-overlay .igdl-spin {
    border-color: rgba(255,255,255,0.3);
    border-top-color: white;
  }
  @keyframes igdl-spin { to { transform: rotate(360deg); } }
`;
document.head.appendChild(style);

// bfcache'den geri gelince scanner'ı yeniden başlat
window.addEventListener("pageshow", e => {
  if (e.persisted) {
    setTimeout(scanAll, 500);
    setTimeout(scanAll, 1500);
  }
});

// ── Başlat ────────────────────────────────────────────────────
scanAll();
setTimeout(scanAll, 800);
setTimeout(scanAll, 2000);
setTimeout(scanAll, 4000);

let _lastUrl = location.href;
const observer = new MutationObserver(() => {
  scanAll();
  if (location.href !== _lastUrl) {
    _lastUrl = location.href;
    setTimeout(scanAll, 500);
    setTimeout(scanAll, 1500);
    setTimeout(scanAll, 3000);
  }
});
observer.observe(document.body, { childList: true, subtree: true });
