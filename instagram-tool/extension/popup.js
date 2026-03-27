const API_PORTS = [8000, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010];
let API = "http://localhost:8000";

async function detectAPI() {
  for (const port of API_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}/me`, { method: "GET", signal: AbortSignal.timeout(800) });
      if (res.status === 200 || res.status === 401) {
        API = `http://localhost:${port}`;
        return;
      }
    } catch {}
  }
}

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Hata oluştu");
  return data;
}

function fmt(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
function fmtSize(b) {
  if (b >= 1024**3) return (b/1024**3).toFixed(1)+" GB";
  if (b >= 1024**2) return (b/1024**2).toFixed(1)+" MB";
  if (b >= 1024)    return (b/1024).toFixed(1)+" KB";
  return b+" B";
}
function loadingHTML() { return `<div class="loading-row"><div class="spinner-sm"></div> Yükleniyor...</div>`; }
function msgHTML(type, text) { return `<div class="result-msg ${type}">${text}</div>`; }

// ── Oturum ────────────────────────────────────────────────────
let loggedIn = false;

function setLoggedIn(user) {
  loggedIn = true;
  document.getElementById("topbar-user").classList.remove("hidden");
  const img = document.getElementById("me-avatar");
  img.src = user.profile_pic; img.onerror = () => img.style.display = "none";
  document.getElementById("me-username").textContent = "@" + user.username;
  refreshGates();
}
function setLoggedOut() { loggedIn = false; document.getElementById("topbar-user").classList.add("hidden"); refreshGates(); }

function refreshGates() {
  ["saved"].forEach(id => {
    const gate = document.getElementById(`${id}-auth-gate`);
    const content = document.getElementById(`${id}-content`);
    if (!gate || !content) return;
    if (loggedIn) { gate.classList.add("hidden"); content.classList.remove("hidden"); }
    else          { gate.classList.remove("hidden"); content.classList.add("hidden"); }
  });
}

// ── Mini Login ────────────────────────────────────────────────
function buildMiniLogin(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <input type="text" class="ml-u" placeholder="Kullanıcı adı" autocomplete="off" />
    <input type="password" class="ml-p" placeholder="Şifre" style="margin-top:8px" />
    <p class="error-msg ml-e"></p>
    <button class="btn-primary ml-btn"><span class="ml-t">Giriş Yap</span><span class="spinner hidden ml-s"></span></button>
    <div class="ml-challenge" style="display:none;margin-top:10px">
      <p style="font-size:11px;color:#e1306c;margin-bottom:6px">📧 Doğrulama kodu gönderildi.</p>
      <input type="text" class="ml-code" placeholder="Doğrulama kodu" maxlength="8" autocomplete="one-time-code" />
      <button class="btn-primary ml-cbtn" style="margin-top:6px"><span class="ml-ct">Doğrula</span><span class="spinner hidden ml-cs"></span></button>
    </div>`;
  el.querySelector(".ml-btn").addEventListener("click", async () => {
    const u = el.querySelector(".ml-u").value.trim();
    const p = el.querySelector(".ml-p").value.trim();
    const e = el.querySelector(".ml-e");
    const t = el.querySelector(".ml-t"); const s = el.querySelector(".ml-s");
    e.textContent = "";
    if (!u || !p) { e.textContent = "Kullanıcı adı ve şifre gerekli."; return; }
    t.classList.add("hidden"); s.classList.remove("hidden");
    try {
      await api("POST", "/login", { username: u, password: p });
      const me = await api("GET", "/me");
      setLoggedIn(me);
    } catch (err) {
      if (err.message === "challenge_required") el.querySelector(".ml-challenge").style.display = "block";
      else e.textContent = err.message;
    } finally { t.classList.remove("hidden"); s.classList.add("hidden"); }
  });
  el.querySelector(".ml-cbtn").addEventListener("click", async () => {
    const code = el.querySelector(".ml-code").value.trim();
    const e = el.querySelector(".ml-e");
    const t = el.querySelector(".ml-ct"); const s = el.querySelector(".ml-cs");
    if (!code) return;
    t.classList.add("hidden"); s.classList.remove("hidden");
    try {
      await api("POST", "/challenge/submit", { code });
      const me = await api("GET", "/me");
      el.querySelector(".ml-challenge").style.display = "none";
      setLoggedIn(me);
    } catch (err) { e.textContent = err.message; }
    finally { t.classList.remove("hidden"); s.classList.add("hidden"); }
  });
}

// ── Nav ───────────────────────────────────────────────────────
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => { p.classList.remove("active"); p.classList.add("hidden"); });
    btn.classList.add("active");
    const pane = document.getElementById("tab-" + btn.dataset.tab);
    pane.classList.remove("hidden"); pane.classList.add("active");
    if (btn.dataset.tab === "downloads") loadFiles();
  });
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await api("POST", "/logout").catch(() => {});
  setLoggedOut();
});

// ── Akıllı Arama — Input Tipi ─────────────────────────────────
function detectType(q) {
  if (!q) return null;
  if (/^https?:\/\/(www\.)?instagram\.com\//i.test(q)) return "url";
  if (q.startsWith("#")) return "hashtag";
  if (q.startsWith("@") || /^[a-zA-Z0-9._]{1,30}$/.test(q)) return "username";
  return "location";
}

const HINTS = { url:"🔗 Post/Reel indir", hashtag:"# Hashtag ara", username:"👤 Story indir / Profil", location:"📍 Konum ara" };

function updateSmartHint() {
  const q = document.getElementById("smart-input").value.trim();
  const hint = document.getElementById("smart-hint");
  const type = detectType(q);
  hint.textContent = type ? HINTS[type] : "";
  // Otomatik önizleme — URL girilince
  if (type === "url") {
    clearTimeout(document.getElementById("smart-input")._t);
    document.getElementById("smart-input")._t = setTimeout(doPreview, 600);
  } else {
    document.getElementById("dl-preview").innerHTML = "";
  }
}

async function doPreview() {
  const q = document.getElementById("smart-input").value.trim();
  const el = document.getElementById("dl-preview");
  if (detectType(q) !== "url") return;
  el.innerHTML = `<div class="preview-card"><div style="padding:14px">${loadingHTML()}</div></div>`;
  try {
    const d = await api("POST", "/media/info", { url: q });
    const typeLabel = { photo:"📷 Fotoğraf", video:"🎬 Video", album:"📚 Albüm" }[d.type] || "📷";
    const date = d.taken_at ? new Date(d.taken_at).toLocaleString("tr-TR",{day:"2-digit",month:"short",year:"numeric"}) : "";
    el.innerHTML = `
      <div class="preview-card">
        <div class="preview-top">
          <div class="preview-thumb-wrap">
            ${d.thumbnail ? `<img src="${d.thumbnail}" onerror="this.style.display='none'" />` : ""}
            <span class="preview-type-badge">${typeLabel}</span>
            ${d.type==="album" ? `<span class="preview-count-badge">📚 ${d.resource_count}</span>` : ""}
          </div>
          <div class="preview-info">
            <div class="preview-user">
              ${d.user_pic ? `<img src="${d.user_pic}" onerror="this.style.display='none'" />` : ""}
              <div>
                <div class="preview-username">@${d.username}</div>
                ${date ? `<div class="preview-date">${date}</div>` : ""}
              </div>
            </div>
            ${d.caption ? `<div class="preview-caption">${d.caption}</div>` : ""}
            <div class="preview-stats">
              <span>❤️ ${fmt(d.likes)}</span>
              <span>💬 ${fmt(d.comments)}</span>
            </div>
          </div>
        </div>
        ${d.type==="album" && d.resources.length ? `
          <div class="preview-album">
            ${d.resources.map(r=>`<div class="preview-album-item">${r.thumbnail?`<img src="${r.thumbnail}" onerror="this.style.display='none'" />`:""}${r.type==="video"?`<div class="album-video-icon">🎬</div>`:""}</div>`).join("")}
          </div>` : ""}
        <div class="preview-footer">
          <button class="btn-primary sm preview-dl-btn" style="margin:0;flex:1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            İndir
          </button>
          <a class="btn-outline sm" href="${q}" target="_blank" style="margin:0;flex:1;text-align:center;text-decoration:none">Instagram'da Aç</a>
        </div>
      </div>`;
    el.querySelector(".preview-dl-btn").addEventListener("click", doSmartAction);
  } catch (e) {
    el.innerHTML = msgHTML("error", e.message);
  }
}

// ── Akıllı İndir / Ara ────────────────────────────────────────
document.getElementById("smart-input").addEventListener("input", updateSmartHint);
document.getElementById("smart-input").addEventListener("keydown", e => { if (e.key === "Enter") doSmartAction(); });
document.getElementById("btn-smart-dl").addEventListener("click", doSmartAction);

async function doSmartAction() {
  const q = document.getElementById("smart-input").value.trim();
  const resEl = document.getElementById("dl-result");
  const gridEl = document.getElementById("dl-grid");
  const locEl = document.getElementById("dl-loc-list");
  const previewEl = document.getElementById("dl-preview");
  if (!q) return;
  const type = detectType(q);
  resEl.innerHTML = ""; gridEl.innerHTML = ""; locEl.innerHTML = "";
  resEl.innerHTML = loadingHTML();

  try {
    if (type === "url") {
      const d = await api("POST", "/download/post", { url: q });
      const files = d.files || (d.file ? [d.file] : []);
      const names = files.map(f => f.split("/").pop()).join(", ");
      resEl.innerHTML = `
        <div class="dl-success">
          ${d.thumbnail ? `<img src="${d.thumbnail}" onerror="this.style.display='none'" />` : `<span style="font-size:28px">${d.type==="video"?"🎬":d.type==="album"?"📚":"📷"}</span>`}
          <div class="dl-success-info">
            <div class="dl-success-title">✓ İndirildi</div>
            <div class="dl-success-name">${names}</div>
            <div class="dl-success-count">${files.length} dosya</div>
          </div>
        </div>`;
      previewEl.innerHTML = "";
    } else if (type === "hashtag") {
      const tag = q.replace("#","");
      const d = await api("POST", "/search/hashtag", { tag, amount: 12 });
      resEl.innerHTML = `<div class="section-label"># ${tag}</div>`;
      gridEl.innerHTML = d.items.length
        ? d.items.map(m => mediaGridItemHTML(m)).join("")
        : msgHTML("error","Sonuç bulunamadı.");
      bindGridDl(gridEl);
    } else if (type === "username") {
      const user = q.replace("@","");
      const d = await api("GET", `/download/stories/${user}`);
      resEl.innerHTML = `
        <div class="dl-success">
          <span style="font-size:28px">📖</span>
          <div class="dl-success-info">
            <div class="dl-success-title">✓ Story İndirildi</div>
            <div class="dl-success-name">@${user}</div>
            <div class="dl-success-count">${d.count} story</div>
          </div>
        </div>`;
    } else {
      const d = await api("GET", `/search/location/${encodeURIComponent(q)}`);
      resEl.innerHTML = "";
      if (!d.items.length) { locEl.innerHTML = msgHTML("error","Konum bulunamadı."); return; }
      locEl.innerHTML = d.items.map(l => `
        <div class="loc-item">
          <div class="loc-name">📍 ${l.name}</div>
          <button class="btn-dl loc-load" data-pk="${l.pk}">Gör</button>
        </div>`).join("");
      locEl.querySelectorAll(".loc-load").forEach(btn => {
        btn.addEventListener("click", async () => {
          btn.textContent = "..."; btn.disabled = true;
          try {
            const data = await api("GET", `/location/medias/${btn.dataset.pk}`);
            gridEl.innerHTML = data.items.map(m => mediaGridItemHTML(m)).join("");
            bindGridDl(gridEl); btn.textContent = "✓";
          } catch { btn.textContent = "✗"; btn.disabled = false; }
        });
      });
    }
  } catch (e) { resEl.innerHTML = msgHTML("error", e.message); }
}

function mediaGridItemHTML(m) {
  return `<div class="media-grid-item">
    ${m.thumbnail ? `<img src="${m.thumbnail}" />` : ""}
    <a href="${m.url}" target="_blank"></a>
    ${m.likes ? `<span class="likes">❤️ ${fmt(m.likes)}</span>` : ""}
    <button class="grid-dl-btn" data-url="${m.url}" title="İndir">⬇</button>
  </div>`;
}

function bindGridDl(container) {
  container.querySelectorAll(".grid-dl-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.preventDefault(); e.stopPropagation();
      btn.textContent = "..."; btn.disabled = true;
      try {
        await api("POST", "/download/post", { url: btn.dataset.url });
        btn.textContent = "✓"; btn.style.background = "#22c55e"; btn.style.color = "white";
      } catch {
        btn.textContent = "✗"; btn.style.background = "#ef4444"; btn.style.color = "white";
      }
    });
  });
}

// ── Kayıtlılar ────────────────────────────────────────────────
let savedItems = [], savedFilter = "all";
const TYPE_ICON = { 1:"📷", 2:"🎬", 8:"📚" };

document.querySelectorAll(".dl-type[data-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dl-type[data-filter]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); savedFilter = btn.dataset.filter; renderSaved();
  });
});

document.getElementById("btn-load-saved").addEventListener("click", async () => {
  const el = document.getElementById("saved-list");
  el.innerHTML = loadingHTML();
  document.getElementById("btn-download-all").classList.add("hidden");
  try {
    const d = await api("GET", "/saved?amount=100");
    savedItems = d.items;
    renderSaved();
    // Koleksiyonları da yükle
    loadExtCollections();
  } catch (e) { el.innerHTML = msgHTML("error", e.message); }
});

async function loadExtCollections() {
  try {
    const d = await api("GET", "/saved/collections");
    if (!d.items.length) return;
    const toolbar = document.querySelector(".saved-toolbar .dl-toggle");
    if (!toolbar) return;
    // Mevcut koleksiyon butonlarını temizle
    toolbar.querySelectorAll(".col-tab").forEach(b => b.remove());
    d.items.forEach(col => {
      const btn = document.createElement("button");
      btn.className = "dl-type col-tab";
      btn.dataset.colpk = col.pk;
      btn.textContent = `📁 ${col.name}`;
      btn.addEventListener("click", async () => {
        document.querySelectorAll(".dl-type").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const el = document.getElementById("saved-list");
        el.innerHTML = loadingHTML();
        try {
          const data = await api("GET", `/saved/collection/${col.pk}?amount=100`);
          savedItems = data.items; renderSaved();
        } catch (e) { el.innerHTML = msgHTML("error", e.message); }
      });
      toolbar.appendChild(btn);
    });
  } catch {}
}

function renderSaved() {
  const el = document.getElementById("saved-list");
  const dlAll = document.getElementById("btn-download-all");
  const filtered = savedFilter === "all" ? savedItems : savedItems.filter(i => String(i.type) === savedFilter);
  if (!filtered.length) { el.innerHTML = msgHTML("error","Gönderi bulunamadı."); dlAll.classList.add("hidden"); return; }
  dlAll.classList.remove("hidden");
  el.innerHTML = filtered.map(item => `
    <div class="saved-item">
      ${item.thumbnail ? `<img class="saved-thumb" src="${item.thumbnail}" onerror="this.style.display='none'" />` : `<div class="saved-thumb-ph">${TYPE_ICON[item.type]||"📷"}</div>`}
      <div class="saved-item-info">
        <a class="saved-url" href="${item.url}" target="_blank">${item.url.replace("https://www.instagram.com/","")}</a>
        <span class="saved-type-badge">${TYPE_ICON[item.type]||""}</span>
      </div>
      <div class="saved-item-btns">
        <button class="btn-dl sv-dl" data-url="${item.url}">⬇</button>
        <button class="btn-dl btn-unsave" data-url="${item.url}">🗑</button>
      </div>
    </div>`).join("");
  el.querySelectorAll(".sv-dl").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.textContent="..."; btn.disabled=true;
      try { await api("POST","/download/saved",{url:btn.dataset.url}); btn.textContent="✓"; btn.classList.add("done"); }
      catch { btn.textContent="✗"; btn.classList.add("fail"); btn.disabled=false; }
    });
  });
  el.querySelectorAll(".btn-unsave").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.textContent="..."; btn.disabled=true;
      try { await api("POST","/unsave",{url:btn.dataset.url}); savedItems=savedItems.filter(i=>i.url!==btn.dataset.url); renderSaved(); }
      catch { btn.textContent="✗"; btn.disabled=false; }
    });
  });
}

document.getElementById("btn-download-all").addEventListener("click", async () => {
  const btn = document.getElementById("btn-download-all");
  const filtered = savedFilter==="all" ? savedItems : savedItems.filter(i=>String(i.type)===savedFilter);
  if (!filtered.length) return;
  btn.disabled = true; let done = 0;
  for (const item of filtered) {
    try { await api("POST","/download/saved",{url:item.url}); } catch {}
    done++; btn.textContent = `⬇ ${done}/${filtered.length}`;
  }
  btn.innerHTML = `✓ ${done} dosya indirildi`;
  setTimeout(() => { btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Tümünü İndir`; btn.disabled=false; }, 3000);
});

// ── Dosyalar (İndirilenler) ───────────────────────────────────
let filesData = [], filesTypeFilter = "all";

document.getElementById("btn-files-refresh").addEventListener("click", loadFiles);
document.querySelectorAll(".dl-type[data-ftype]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dl-type[data-ftype]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); filesTypeFilter = btn.dataset.ftype; renderFiles();
  });
});

async function loadFiles() {
  const el = document.getElementById("files-list");
  el.innerHTML = loadingHTML();
  try {
    const d = await api("GET", "/downloads/list");
    filesData = d.items; renderFiles();
  } catch (e) { el.innerHTML = msgHTML("error", e.message); }
}

function renderFiles() {
  const el = document.getElementById("files-list");
  const statsEl = document.getElementById("files-stats");
  let filtered = filesData;
  if (filesTypeFilter !== "all") filtered = filtered.filter(i => i.type === filesTypeFilter);

  const total = filtered.length;
  const totalSize = filtered.reduce((s,i) => s+i.size, 0);
  statsEl.innerHTML = total
    ? `<span class="files-stat-pill">📁 ${total} dosya</span><span class="files-stat-pill">💾 ${fmtSize(totalSize)}</span>`
    : "";

  if (!filtered.length) {
    el.innerHTML = `<div style="text-align:center;padding:28px 0;color:var(--muted);font-size:12px">📂 Henüz indirilmiş dosya yok.</div>`;
    return;
  }

  el.innerHTML = filtered.map(item => {
    const fileUrl = `${API}${item.url}`;
    const date = new Date(item.mtime*1000).toLocaleString("tr-TR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});
    return `
      <div class="file-item">
        ${item.type==="image"
          ? `<img class="file-thumb" src="${fileUrl}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="file-thumb-ph" style="display:none">🖼</div>`
          : `<div class="file-thumb-ph">🎬</div>`}
        <div class="file-info">
          <div class="file-name" title="${item.name}">${item.name}</div>
          <div class="file-meta">
            <span class="file-badge ${item.type}">${item.type==="image"?"🖼":"🎬"}</span>
            <span class="file-badge size">${fmtSize(item.size)}</span>
            <span class="file-badge date">${date}</span>
          </div>
        </div>
        <div class="file-actions">
          ${item.instagram_url
            ? `<a class="btn-dl" href="${item.instagram_url}" target="_blank" title="Instagram'da aç" style="text-decoration:none;display:flex;align-items:center;justify-content:center">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>
               </a>`
            : `<a class="btn-dl" href="${fileUrl}" target="_blank" title="Aç" style="text-decoration:none;display:flex;align-items:center;justify-content:center">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
               </a>`}
          <button class="btn-dl file-del" data-rel="${item.rel}" title="Sil">🗑</button>
        </div>
      </div>`;
  }).join("");

  el.querySelectorAll(".file-del").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Dosyayı sil?")) return;
      btn.disabled = true; btn.textContent = "...";
      try {
        await api("DELETE", `/downloads/file/${btn.dataset.rel}`);
        filesData = filesData.filter(i => i.rel !== btn.dataset.rel);
        renderFiles();
      } catch { btn.textContent = "✗"; btn.disabled = false; }
    });
  });
}

// ── Başlangıç ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await detectAPI();
  buildMiniLogin("mini-login-saved");
  api("GET", "/me").then(setLoggedIn).catch(setLoggedOut);
});
