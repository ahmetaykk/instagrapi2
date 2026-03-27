const API = "http://localhost:8000";

// ── Global state ──────────────────────────────────────────────
let flwData = { followers: [], following: [] };
let flwTab = "followers";
let flwFilter = "";
let flwSort = "default";
let flwSelected = new Set();
let flwLoadCancelled = false;

// İndirilmiş Instagram URL'lerini takip et (localStorage + backend sync)
const downloadedUrls = new Set(JSON.parse(localStorage.getItem("downloadedUrls") || "[]"));
// instagram_url → rel path map (klasör butonu için)
const downloadedRelMap = {};

function markDownloaded(url, rel) {
  downloadedUrls.add(url);
  if (rel) downloadedRelMap[url] = rel;
  localStorage.setItem("downloadedUrls", JSON.stringify([...downloadedUrls]));
}

// Sayfa yüklenince backend'deki indirilenlerle senkronize et
async function syncDownloadedUrls() {
  try {
    const d = await api("GET", "/downloads/list");
    let changed = false;
    d.items.forEach(item => {
      if (item.instagram_url) {
        if (!downloadedUrls.has(item.instagram_url)) {
          downloadedUrls.add(item.instagram_url);
          changed = true;
        }
        // rel path'i her zaman güncelle
        downloadedRelMap[item.instagram_url] = item.rel;
      }
    });
    if (changed) {
      localStorage.setItem("downloadedUrls", JSON.stringify([...downloadedUrls]));
      refreshGridDownloadedState();
    }
  } catch {}
}

// Mevcut grid kartlarını yeniden render etmeden sadece state'i güncelle
function refreshGridDownloadedState() {
  document.querySelectorAll(".media-item[data-url]").forEach(card => {
    const url = card.dataset.url;
    if (!url || !downloadedUrls.has(url)) return;
    if (card.classList.contains("media-item-downloaded")) return;
    card.classList.add("media-item-downloaded");
    // Badge ekle
    if (!card.querySelector(".media-item-dl-badge")) {
      const badge = document.createElement("div");
      badge.className = "media-item-dl-badge";
      badge.textContent = "✓ İndirildi";
      card.appendChild(badge);
    }
    // İndir butonunu devre dışı bırak
    const dlBtn = card.querySelector(".grid-dl");
    if (dlBtn) { dlBtn.disabled = true; dlBtn.textContent = "✓ İndirildi"; }
  });
}

// Instagram CDN resimlerini backend proxy üzerinden serve et
function proxyImg(url) {
  if (!url) return "";
  if (url.startsWith("http://localhost") || url.startsWith("/")) return url;
  return `${API}/proxy/image?url=${encodeURIComponent(url)}`;
}

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (res.status === 401 && path !== "/login" && path !== "/challenge/submit") {
    document.getElementById("main")?.classList.add("hidden");
    document.getElementById("login-screen")?.classList.remove("hidden");
    throw new Error("Oturum süresi doldu, lütfen tekrar giriş yapın.");
  }
  if (!res.ok) throw new Error(data.detail || "Hata oluştu");
  return data;
}

function fmt(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function toast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 3200);
}

function loading(el) {
  el.innerHTML = `<div class="loading"><div class="spin"></div> Yükleniyor...</div>`;
}

function msgEl(type, text) {
  return `<div class="msg ${type}">${text}</div>`;
}

// ── Beni Hatırla ──────────────────────────────────────────────
(function loadRemembered() {
  const saved = localStorage.getItem("remembered_user");
  if (saved) {
    document.getElementById("l-user").value = saved;
    document.getElementById("remember-me").checked = true;
  }
})();

// ── Login ekranına geç (hızlı indir panelinden) ──────────────
function switchLoginTab() {
  document.getElementById("login-screen").scrollIntoView({ behavior: "smooth" });
  document.getElementById("l-user").focus();
}

// ── Login ─────────────────────────────────────────────────────
document.getElementById("btn-login").addEventListener("click", doLogin);
document.getElementById("l-pass").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
document.getElementById("l-user").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

async function doLogin() {
  const u = document.getElementById("l-user").value.trim();
  const p = document.getElementById("l-pass").value.trim();
  const err = document.getElementById("login-err");
  const txt = document.getElementById("login-txt");
  const spin = document.getElementById("login-spin");
  err.textContent = "";
  if (!u || !p) { err.textContent = "Kullanıcı adı ve şifre gerekli."; return; }
  if (document.getElementById("remember-me").checked) {
    localStorage.setItem("remembered_user", u);
  } else {
    localStorage.removeItem("remembered_user");
  }
  txt.classList.add("hidden"); spin.classList.remove("hidden");
  try {
    const me = await api("POST", "/login", { username: u, password: p });
    showDashboard(me);
  } catch (e) {
    if (e.message === "challenge_required") {
      document.getElementById("challenge-box").style.display = "block";
    } else {
      err.textContent = e.message;
    }
  } finally {
    txt.classList.remove("hidden"); spin.classList.add("hidden");
  }
}

// ── Challenge ─────────────────────────────────────────────────
document.getElementById("btn-challenge").addEventListener("click", doChallenge);
document.getElementById("challenge-code").addEventListener("keydown", e => { if (e.key === "Enter") doChallenge(); });

async function doChallenge() {
  const code = document.getElementById("challenge-code").value.trim();
  const err = document.getElementById("login-err");
  const txt = document.getElementById("challenge-txt");
  const spin = document.getElementById("challenge-spin");
  if (!code) return;
  txt.classList.add("hidden"); spin.classList.remove("hidden");
  try {
    const me = await api("POST", "/challenge/submit", { code });
    document.getElementById("challenge-box").style.display = "none";
    showDashboard(me);
  } catch (e) {
    err.textContent = e.message;
  } finally {
    txt.classList.remove("hidden"); spin.classList.add("hidden");
  }
}

function showDashboard(me) {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main").classList.remove("hidden");
  const pic = document.getElementById("me-pic");
  pic.src = proxyImg(me.profile_pic);
  pic.onerror = () => pic.style.display = "none";
  document.getElementById("me-name").textContent = "@" + me.username;
  document.getElementById("me-full").textContent = me.full_name || "";
  document.getElementById("d-followers").textContent = fmt(me.followers);
  document.getElementById("d-following").textContent = fmt(me.following);
  api("GET", `/profile/${me.username}`).then(d => {
    document.getElementById("d-posts").textContent = fmt(d.posts);
  }).catch(() => {});
  syncDownloadedUrls(); // indirilenlerle senkronize et
}

// ── Logout ────────────────────────────────────────────────────
document.getElementById("btn-logout").addEventListener("click", async () => {
  await api("POST", "/logout").catch(() => {});
  document.getElementById("main").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  toast("Çıkış yapıldı");
});

// ── Sayfa geçiş yardımcısı ────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelector(`[data-page="${page}"]`)?.classList.add("active");
  document.getElementById("page-" + page)?.classList.add("active");
  if (page === "downloads") loadDownloads();
  if (page === "followers" && !flwData.followers.length) loadFollowers();
  if (page === "publish") loadPublishQueue();
}

// ── Navigation ────────────────────────────────────────────────
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => navigateTo(item.dataset.page));
});

// ── Smart Search — Input Tipi Algılama ────────────────────────
function detectInputType(q) {
  if (!q) return null;
  if (/^https?:\/\/(www\.)?instagram\.com\//i.test(q)) return "url";
  if (q.startsWith("#")) return "hashtag";
  if (q.startsWith("@") || /^[a-zA-Z0-9._]{1,30}$/.test(q)) return "username";
  return "location";
}

function updateHint(inputId, hintId) {
  const q = document.getElementById(inputId).value.trim();
  const hint = document.getElementById(hintId);
  if (!hint) return;
  const type = detectInputType(q);
  const labels = {
    url: "🔗 Post / Reel indirilecek",
    hashtag: "# Hashtag aranacak",
    username: "👤 Kullanıcı / Story",
    location: "📍 Konum aranacak"
  };
  hint.textContent = type ? labels[type] : "";
}

// ── Dashboard Akıllı Arama ────────────────────────────────────
document.getElementById("btn-dash-search").addEventListener("click", doDashSearch);
document.getElementById("dash-search").addEventListener("keydown", e => { if (e.key === "Enter") doDashSearch(); });
document.getElementById("dash-search").addEventListener("input", () => updateHint("dash-search", "dash-search-hint"));

async function doDashSearch() {
  const q = document.getElementById("dash-search").value.trim();
  const el = document.getElementById("dash-search-result");
  if (!q) return;
  const type = detectInputType(q);
  loading(el);
  try {
    if (type === "url") {
      const d = await api("POST", "/download/post", { url: q });
      el.innerHTML = msgEl("ok", `✓ İndirildi → ${d.file || (d.files || []).join(", ")}`);
      toast("İndirildi", "ok");
    } else if (type === "hashtag") {
      const tag = q.replace("#", "");
      const d = await api("POST", "/search/hashtag", { tag, amount: 12 });
      el.innerHTML = `<div class="media-grid" style="margin-top:12px">${d.items.map(mediaItemHTML).join("")}</div>`;
      bindGridDl(el);
    } else if (type === "username") {
      const user = q.replace("@", "");
      const d = await api("GET", `/profile/${user}`);
      el.innerHTML = profileCardHTML(d);
    } else {
      const d = await api("GET", `/search/location/${encodeURIComponent(q)}`);
      el.innerHTML = locListHTML(d.items) + `<div id="dash-loc-grid" class="media-grid" style="margin-top:12px"></div>`;
      bindLocButtons(el, el.querySelector("#dash-loc-grid"));
    }
  } catch (e) { el.innerHTML = msgEl("err", e.message); }
}

// ── Profil Ara ────────────────────────────────────────────────
document.getElementById("btn-p-search").addEventListener("click", searchProfile);
document.getElementById("p-search").addEventListener("keydown", e => { if (e.key === "Enter") searchProfile(); });

async function searchProfile() {
  const q = document.getElementById("p-search").value.trim().replace("@", "");
  const el = document.getElementById("profile-result");
  if (!q) return;
  loading(el);
  try {
    const d = await api("GET", `/profile/${q}`);
    el.innerHTML = profileCardHTML(d);
    bindProfileActions(el, d.username);
  } catch (e) { el.innerHTML = msgEl("err", e.message); }
}

function profileCardHTML(d) {
  return `
    <div class="profile-big">
      <div class="profile-big-header">
        <img src="${proxyImg(d.profile_pic)}" onerror="this.style.display='none'" />
        <div>
          <div class="profile-big-name">${d.username}</div>
          <div class="profile-big-full">${d.full_name || ""}</div>
          <span class="profile-big-badge">${d.is_private ? "🔒 Gizli Hesap" : "🌐 Açık Hesap"}</span>
        </div>
      </div>
      <div class="profile-big-stats">
        <div class="profile-big-stat"><div class="n">${fmt(d.followers)}</div><div class="l">Takipçi</div></div>
        <div class="profile-big-stat"><div class="n">${fmt(d.following)}</div><div class="l">Takip</div></div>
        <div class="profile-big-stat"><div class="n">${fmt(d.posts)}</div><div class="l">Gönderi</div></div>
      </div>
      ${d.bio ? `<div class="profile-big-bio">${d.bio}</div>` : ""}
      <div class="profile-big-actions">
        <button class="btn-grad sm pa-follow" data-u="${d.username}">Takip Et</button>
        <button class="btn-outline sm pa-unfollow" data-u="${d.username}">Takibi Bırak</button>
        <button class="btn-outline sm pa-followers" data-u="${d.username}">Takipçileri Gör</button>
        <button class="btn-outline sm pa-following" data-u="${d.username}">Takip Ettikleri</button>
      </div>
      <div class="pa-sub" style="padding:0 28px 20px"></div>
    </div>`;
}

function bindProfileActions(container, username) {
  const sub = container.querySelector(".pa-sub");
  container.querySelector(".pa-follow").onclick = async () => {
    loading(sub);
    try { await api("POST", "/follow", { username }); sub.innerHTML = msgEl("ok", "✓ Takip edildi"); toast("Takip edildi", "ok"); }
    catch (e) { sub.innerHTML = msgEl("err", e.message); }
  };
  container.querySelector(".pa-unfollow").onclick = async () => {
    loading(sub);
    try { await api("POST", "/unfollow", { username }); sub.innerHTML = msgEl("ok", "✓ Takip bırakıldı"); toast("Takip bırakıldı"); }
    catch (e) { sub.innerHTML = msgEl("err", e.message); }
  };
  container.querySelector(".pa-followers").onclick = async () => {
    loading(sub);
    try { const data = await api("GET", `/followers/${username}`); sub.innerHTML = `<div class="user-list">${data.items.map(userRowHTML).join("")}</div>`; }
    catch (e) { sub.innerHTML = msgEl("err", e.message); }
  };
  container.querySelector(".pa-following").onclick = async () => {
    loading(sub);
    try { const data = await api("GET", `/following/${username}`); sub.innerHTML = `<div class="user-list">${data.items.map(userRowHTML).join("")}</div>`; }
    catch (e) { sub.innerHTML = msgEl("err", e.message); }
  };
}

function userRowHTML(u) {
  return `<div class="user-row">
    <img src="${proxyImg(u.pic)}" onerror="this.style.display='none'" />
    <div class="user-row-info">
      <div class="user-row-name">@${u.username}</div>
      <div class="user-row-full">${u.full_name || ""}</div>
    </div>
  </div>`;
}

// ── İndir Akıllı Arama ────────────────────────────────────────
document.getElementById("btn-dl-search").addEventListener("click", doDlSearch);
document.getElementById("btn-dl-preview").addEventListener("click", doDlPreview);
document.getElementById("dl-search").addEventListener("keydown", e => { if (e.key === "Enter") doDlSearch(); });
document.getElementById("dl-search").addEventListener("input", () => {
  updateHint("dl-search", "dl-search-hint");
  const q = document.getElementById("dl-search").value.trim();
  // Sadece URL girildiğinde otomatik önizle
  if (detectInputType(q) === "url") {
    clearTimeout(document.getElementById("dl-search")._previewTimer);
    document.getElementById("dl-search")._previewTimer = setTimeout(() => doDlPreview(), 600);
  } else {
    document.getElementById("dl-preview-card").innerHTML = "";
  }
});

// "Tümünü Gör" linki → İndirilenler sayfasına geç
document.querySelector(".dl-recent-all").addEventListener("click", () => navigateTo("downloads"));

async function doDlPreview() {
  const q = document.getElementById("dl-search").value.trim();
  const previewEl = document.getElementById("dl-preview-card");
  const resEl = document.getElementById("dl-search-result");
  if (!q) return;
  const type = detectInputType(q);
  if (type !== "url") { resEl.innerHTML = msgEl("err", "Önizleme sadece Instagram URL'leri için çalışır."); return; }
  previewEl.innerHTML = ""; resEl.innerHTML = "";
  previewEl.innerHTML = `<div style="padding:20px">${`<div class="loading"><div class="spin"></div> Medya bilgisi alınıyor...</div>`}</div>`;
  try {
    const d = await api("POST", "/media/info", { url: q });
    const typeLabel = { photo: "📷 Fotoğraf", video: "🎬 Video", album: "📚 Albüm" }[d.type] || "📷";
    const date = d.taken_at ? new Date(d.taken_at).toLocaleString("tr-TR", { day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "";
    const albumGrid = d.type === "album" && d.resources.length ? `
      <div class="dl-preview-album">
        ${d.resources.map(r => `
          <div class="dl-preview-album-item">
            ${r.thumbnail ? `<img src="${r.thumbnail}" onerror="this.style.display='none'" />` : ""}
            ${r.type === "video" ? `<div class="type-icon">🎬</div>` : ""}
          </div>`).join("")}
      </div>` : "";
    previewEl.innerHTML = `
      <div class="dl-preview-card">
        <div class="dl-preview-top">
          <div class="dl-preview-thumb-wrap">
            ${d.thumbnail ? `<img src="${proxyImg(d.thumbnail)}" onerror="this.style.display='none'" />` : ""}
            <div class="dl-preview-type-badge">${typeLabel}</div>
            ${d.type === "album" ? `<div class="dl-preview-count-badge">📚 ${d.resource_count}</div>` : ""}
          </div>
          <div class="dl-preview-info">
            <div class="dl-preview-user">
              ${d.user_pic ? `<img src="${proxyImg(d.user_pic)}" onerror="this.style.display='none'" />` : ""}
              <div>
                <div class="dl-preview-username">@${d.username}</div>
                ${date ? `<div class="dl-preview-date">${date}</div>` : ""}
              </div>
            </div>
            ${d.caption ? `<div class="dl-preview-caption">${d.caption}</div>` : ""}
            <div class="dl-preview-stats">
              <div class="dl-preview-stat">❤️ ${fmt(d.likes)} <span>beğeni</span></div>
              <div class="dl-preview-stat">💬 ${fmt(d.comments)} <span>yorum</span></div>
            </div>
          </div>
        </div>
        ${albumGrid}
        <div class="dl-preview-actions">
          <button class="btn-grad sm" id="btn-preview-dl">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            İndir
          </button>
          <a class="btn-outline sm" href="${q}" target="_blank">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Instagram'da Aç
          </a>
          <span style="font-size:12px;color:var(--muted);margin-left:auto">${d.type === "album" ? `${d.resource_count} dosya indirilecek` : "1 dosya indirilecek"}</span>
        </div>
      </div>`;
    document.getElementById("btn-preview-dl").addEventListener("click", () => doDlSearch());
  } catch (e) {
    previewEl.innerHTML = "";
    resEl.innerHTML = msgEl("err", e.message);
  }
}

async function doDlSearch() {
  const q = document.getElementById("dl-search").value.trim();
  const resEl = document.getElementById("dl-search-result");
  const gridEl = document.getElementById("dl-media-grid");
  const locEl = document.getElementById("dl-loc-list");
  const previewEl = document.getElementById("dl-preview-card");
  if (!q) return;
  const type = detectInputType(q);
  resEl.innerHTML = ""; gridEl.innerHTML = ""; locEl.innerHTML = "";
  loading(resEl);
  try {
    if (type === "url") {
      const d = await api("POST", "/download/post", { url: q });
      const files = d.files || (d.file ? [d.file] : []);
      const names = files.map(f => f.split("/").pop()).join(", ");
      resEl.innerHTML = `
        <div class="dl-success-card">
          ${d.thumbnail ? `<img src="${proxyImg(d.thumbnail)}" onerror="this.style.display='none'" />` : `<div class="dl-success-icon">${d.type === "video" ? "🎬" : d.type === "album" ? "📚" : "📷"}</div>`}
          <div class="dl-success-info">
            <div class="dl-success-title">✓ Başarıyla İndirildi</div>
            <div class="dl-success-files">${names}</div>
            <div class="dl-success-count">${files.length} dosya • ${d.type === "album" ? "Albüm" : d.type === "video" ? "Video" : "Fotoğraf"}</div>
          </div>
          <button class="btn-outline sm" id="btn-goto-downloads">İndirilenler →</button>
        </div>`;
      previewEl.innerHTML = "";
      toast("İndirildi", "ok");
      markDownloaded(q);
      document.getElementById("btn-goto-downloads")?.addEventListener("click", () => navigateTo("downloads"));
      loadDlRecent();
    } else if (type === "hashtag") {
      const tag = q.replace("#", "");
      resEl.innerHTML = `<div class="dl-section-label"># ${tag} için gönderiler</div>`;
      loading(gridEl);
      const d = await api("POST", "/search/hashtag", { tag, amount: 18 });
      gridEl.innerHTML = d.items.length
        ? d.items.map(mediaItemHTML).join("")
        : `<p style="color:var(--muted)">Sonuç bulunamadı.</p>`;
      bindGridDl(gridEl);
    } else if (type === "username") {
      const user = q.replace("@", "");
      resEl.innerHTML = `<div class="loading"><div class="spin"></div> @${user} story'leri indiriliyor...</div>`;
      const d = await api("GET", `/download/stories/${user}`);
      resEl.innerHTML = `
        <div class="dl-success-card">
          <div class="dl-success-icon">📖</div>
          <div class="dl-success-info">
            <div class="dl-success-title">✓ Story'ler İndirildi</div>
            <div class="dl-success-files">@${user}</div>
            <div class="dl-success-count">${d.count} story indirildi</div>
          </div>
          <button class="btn-outline sm" id="btn-goto-downloads2">İndirilenler →</button>
        </div>`;
      toast(`${d.count} story indirildi`, "ok");
      document.getElementById("btn-goto-downloads2")?.addEventListener("click", () => navigateTo("downloads"));
      loadDlRecent();
    } else {
      resEl.innerHTML = "";
      loading(locEl);
      const d = await api("GET", `/search/location/${encodeURIComponent(q)}`);
      locEl.innerHTML = locListHTML(d.items);
      bindLocButtons(locEl, gridEl);
    }
  } catch (e) { resEl.innerHTML = msgEl("err", e.message); }
}

async function loadDlRecent() {
  try {
    const d = await api("GET", "/downloads/list");
    const recent = d.items.slice(0, 10);
    if (!recent.length) return;
    const wrap = document.getElementById("dl-recent-wrap");
    const grid = document.getElementById("dl-recent-grid");
    wrap.style.display = "";
    grid.innerHTML = recent.map(item => {
      const fileUrl = `${API}${item.url}`;
      return `<div class="dl-recent-item" title="${item.name}">
        ${item.type === "image"
          ? `<img src="${fileUrl}" loading="lazy" onerror="this.style.display='none'" />`
          : `<div class="video-icon">🎬</div>`}
        <div class="type-pill">${item.type === "video" ? "🎬" : "🖼"} ${fmtSize(item.size)}</div>
      </div>`;
    }).join("");
  } catch {}
}

// ── Keşfet Akıllı Arama ───────────────────────────────────────
document.getElementById("btn-ex-search").addEventListener("click", doExSearch);
document.getElementById("ex-search").addEventListener("keydown", e => { if (e.key === "Enter") doExSearch(); });
document.getElementById("ex-search").addEventListener("input", () => updateHint("ex-search", "ex-search-hint"));

async function doExSearch() {
  const q = document.getElementById("ex-search").value.trim();
  const resEl = document.getElementById("ex-search-result");
  const gridEl = document.getElementById("ex-media-grid");
  const locEl = document.getElementById("ex-loc-list");
  if (!q) return;
  const type = detectInputType(q);
  resEl.innerHTML = ""; gridEl.innerHTML = ""; locEl.innerHTML = "";
  loading(resEl);
  try {
    if (type === "hashtag") {
      const tag = q.replace("#", "");
      resEl.innerHTML = "";
      loading(gridEl);
      const d = await api("POST", "/search/hashtag", { tag, amount: 18 });
      gridEl.innerHTML = d.items.map(mediaItemHTML).join("");
      bindGridDl(gridEl);
    } else if (type === "username" || type === "url") {
      const user = q.replace("@", "");
      const d = await api("GET", `/search/users/${user}`);
      resEl.innerHTML = d.items.length
        ? `<div class="user-list">${d.items.map(userRowHTML).join("")}</div>`
        : `<p style="color:var(--muted)">Kullanıcı bulunamadı.</p>`;
    } else {
      resEl.innerHTML = "";
      loading(locEl);
      const d = await api("GET", `/search/location/${encodeURIComponent(q)}`);
      locEl.innerHTML = locListHTML(d.items);
      bindLocButtons(locEl, gridEl);
    }
  } catch (e) { resEl.innerHTML = msgEl("err", e.message); }
}

// ── Konum Yardımcıları ────────────────────────────────────────
function locListHTML(items) {
  if (!items || !items.length) return `<p style="color:var(--muted)">Konum bulunamadı.</p>`;
  return `<div class="loc-list">${items.map(l => `
    <div class="loc-row">
      <div class="loc-row-name">📍 ${l.name}</div>
      <button class="btn-outline sm loc-load" data-pk="${l.pk}">Gönderileri Gör</button>
    </div>`).join("")}</div>`;
}

function bindLocButtons(locEl, gridEl) {
  locEl.querySelectorAll(".loc-load").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.textContent = "Yükleniyor..."; btn.disabled = true;
      try {
        const data = await api("GET", `/location/medias/${btn.dataset.pk}`);
        gridEl.innerHTML = data.items.map(mediaItemHTML).join("");
        bindGridDl(gridEl); btn.textContent = "✓";
      } catch { btn.textContent = "Hata"; btn.disabled = false; }
    });
  });
}

// ── Media Grid Yardımcıları ───────────────────────────────────
function mediaItemHTML(m) {
  const isDl = downloadedUrls.has(m.url);
  return `<div class="media-item${isDl ? " media-item-downloaded" : ""}" data-url="${m.url}">
    ${m.thumbnail ? `<img src="${proxyImg(m.thumbnail)}" onerror="this.style.display='none'" />` : ""}
    ${m.likes ? `<div class="media-item-likes">❤️ ${fmt(m.likes)}</div>` : ""}
    ${isDl ? `<div class="media-item-dl-badge">✓ İndirildi</div>` : ""}
    <div class="media-item-overlay">
      <div class="media-item-actions">
        <a href="${m.url}" target="_blank">Aç</a>
        <button class="grid-dl" data-url="${m.url}" ${isDl ? 'disabled title="Zaten indirildi"' : ""}>
          ${isDl ? "✓ İndirildi" : "⬇ İndir"}
        </button>
      </div>
    </div>
  </div>`;
}

function bindGridDl(container) {
  container.querySelectorAll(".grid-dl").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (btn.disabled) return;
      btn.textContent = "..."; btn.disabled = true;
      try {
        await api("POST", "/download/post", { url: btn.dataset.url });
        btn.textContent = "✓";
        markDownloaded(btn.dataset.url);
        btn.closest(".media-item")?.classList.add("media-item-downloaded");
        toast("İndirildi", "ok");
      } catch { btn.textContent = "✗"; btn.disabled = false; }
    });
  });
}

// ── Klasör butonu yardımcısı ──────────────────────────────────
function createFolderBtn(rel) {
  const btn = document.createElement("button");
  btn.className = "sv-folder btn-outline sm";
  btn.title = "Klasörde göster";
  btn.dataset.rel = rel;
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  btn.addEventListener("click", async ev => {
    ev.stopPropagation();
    try { await api("GET", `/downloads/open-folder?path=${encodeURIComponent(rel)}`); }
    catch (err) { toast(err.message, "err"); }
  });
  return btn;
}

// ── Kayıtlılar ────────────────────────────────────────────────
let savedItems = [], savedFilter = "all", savedColPk = "saved";
let savedSelected = new Set(); // seçili URL'ler

document.getElementById("btn-load-saved").addEventListener("click", loadSaved);

async function loadSaved() {
  const el = document.getElementById("saved-grid");
  const countEl = document.getElementById("saved-count");
  const amountVal = parseInt(document.getElementById("saved-amount-select").value) || 0;
  const isAll = amountVal === 0;

  loading(el);
  countEl.textContent = isAll ? "Tüm kayıtlar yükleniyor..." : "";

  try {
    if (document.querySelectorAll(".saved-col-tab[data-col]").length === 0) {
      await loadSavedCollections();
    }
    const endpoint = savedColPk === "saved"
      ? `/saved?amount=${isAll ? 0 : amountVal}`
      : `/saved/collection/${savedColPk}?amount=${isAll ? 0 : amountVal}`;
    // Not: savedColPk ilk koleksiyon yüklenince otomatik güncellenir
    const d = await api("GET", endpoint);
    savedItems = d.items;
    countEl.textContent = `${d.total} gönderi yüklendi`;
    renderSaved();
  } catch (e) { el.innerHTML = msgEl("err", e.message); countEl.textContent = ""; }
}

async function loadSavedCollections() {
  try {
    const d = await api("GET", "/saved/collections");
    const tabsEl = document.getElementById("saved-col-tabs");
    d.items.forEach((col, idx) => {
      if (tabsEl.querySelector(`[data-col="${col.pk}"]`)) return;
      const btn = document.createElement("button");
      btn.className = "saved-col-tab";
      btn.dataset.col = col.pk;
      btn.innerHTML = `📁 ${col.name}${col.count ? ` <span class="saved-col-count">${col.count}</span>` : ""}`;
      btn.addEventListener("click", () => switchSavedCol(col.pk, btn));
      tabsEl.appendChild(btn);
      // Sadece ilk koleksiyonu otomatik aktif yap
      if (idx === 0) {
        savedColPk = col.pk;
        btn.classList.add("active");
      }
    });
  } catch {}
}

function switchSavedCol(pk, btn) {
  document.querySelectorAll(".saved-col-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  savedColPk = pk;
  savedItems = [];
  loadSaved();
}

document.getElementById("saved-seg").querySelectorAll(".seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#saved-seg .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    savedFilter = btn.dataset.filter;
    renderSaved();
  });
});

function renderSaved() {
  const el = document.getElementById("saved-grid");
  const dlAll = document.getElementById("btn-dl-all");
  const selAll = document.getElementById("btn-sv-select-all");
  const rmSel = document.getElementById("btn-sv-rm-selected");
  const TYPE_LABEL = { 1: "📷 Fotoğraf", 2: "🎬 Video", 8: "📚 Albüm" };
  const TYPE_CLASS = { 1: "image", 2: "video", 8: "album" };
  const filtered = savedFilter === "all" ? savedItems : savedItems.filter(i => String(i.type) === savedFilter);

  if (!filtered.length) {
    el.innerHTML = `<p style="color:var(--muted);padding:20px 0">Gönderi bulunamadı.</p>`;
    dlAll.style.display = "none";
    selAll.style.display = "none";
    rmSel.style.display = "none";
    return;
  }

  dlAll.style.display = "";
  selAll.style.display = "";

  const updateSelBtn = () => {
    const count = savedSelected.size;
    rmSel.style.display = count > 0 ? "" : "none";
    rmSel.textContent = count > 0 ? `Seçilenleri Kaldır (${count})` : "Seçilenleri Kaldır";
    const allSelected = filtered.every(i => savedSelected.has(i.url));
    selAll.textContent = allSelected ? "Seçimi Kaldır" : "Tümünü Seç";
  };

  el.innerHTML = filtered.map((item, idx) => {
    const isDl = downloadedUrls.has(item.url);
    const isSelected = savedSelected.has(item.url);
    const shortCode = item.url.replace(/.*\/p\/|.*\/reel\//, "").replace(/\/$/, "").slice(0, 12);
    const typeLabel = TYPE_LABEL[item.type] || "📷";
    const typeClass = TYPE_CLASS[item.type] || "image";
    return `
    <div class="sv-item ${isSelected ? "sv-item-selected" : ""} ${isDl ? "sv-item-downloaded" : ""}" data-url="${item.url}" data-idx="${idx}">
      <input type="checkbox" class="sv-checkbox" ${isSelected ? "checked" : ""} />
      <div class="sv-thumb">
        ${item.thumbnail ? `<img src="${proxyImg(item.thumbnail)}" onerror="this.style.display='none'" loading="lazy" />` : `<div class="sv-thumb-placeholder">${typeLabel.split(" ")[0]}</div>`}
        ${isDl ? `<div class="sv-dl-badge">✓</div>` : ""}
      </div>
      <div class="sv-info">
        <div class="sv-info-top">
          <span class="sv-type-badge ${typeClass}">${typeLabel}</span>
          ${isDl ? `<span class="sv-downloaded-label">✓ İndirildi</span>` : ""}
        </div>
        <div class="sv-url" title="${item.url}">${shortCode}</div>
        <a class="sv-link" href="${item.url}" target="_blank">${item.url}</a>
      </div>
      <div class="sv-actions">
        <button class="sv-dl btn-grad sm" data-url="${item.url}" ${isDl ? 'disabled title="Zaten indirildi"' : ""}>
          ${isDl ? "✓ İndirildi" : "⬇ İndir"}
        </button>
        ${isDl && downloadedRelMap[item.url] ? `
        <button class="sv-folder btn-outline sm" data-rel="${downloadedRelMap[item.url]}" title="Klasörde göster">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </button>` : ""}
        <button class="sv-rm btn-outline sm" data-url="${item.url}">🗑</button>
      </div>
    </div>`;
  }).join("");

  // Checkbox / satır tıklama ile seçim
  el.querySelectorAll(".sv-item").forEach(row => {
    const cb = row.querySelector(".sv-checkbox");
    const toggle = () => {
      const url = row.dataset.url;
      if (savedSelected.has(url)) {
        savedSelected.delete(url);
        row.classList.remove("sv-item-selected");
        cb.checked = false;
      } else {
        savedSelected.add(url);
        row.classList.add("sv-item-selected");
        cb.checked = true;
      }
      updateSelBtn();
    };
    cb.addEventListener("change", toggle);
    row.addEventListener("click", e => {
      if (e.target.closest(".sv-actions") || e.target.closest("a")) return;
      toggle();
    });
  });

  el.querySelectorAll(".sv-dl").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (btn.disabled) return;
      const origText = btn.textContent;
      btn.innerHTML = `<span class="spin" style="width:12px;height:12px;border-width:2px"></span> İndiriliyor`;
      btn.disabled = true;
      try {
        const res = await api("POST", "/download/saved", { url: btn.dataset.url });
        const filePath = res.file || (res.files && res.files[0]) || "";
        const base = (filePath.match(/Downloads\/instagram\/(.+)/) || [])[1] || "";
        markDownloaded(btn.dataset.url, base);
        btn.textContent = "✓ İndirildi";
        toast("İndirildi", "ok");
        // Satırı güncelle
        const row = btn.closest(".sv-item");
        if (row) {
          row.classList.add("sv-item-downloaded");
          const lbl = row.querySelector(".sv-info-top");
          if (lbl && !lbl.querySelector(".sv-downloaded-label")) {
            lbl.insertAdjacentHTML("beforeend", `<span class="sv-downloaded-label">✓ İndirildi</span>`);
          }
          const thumb = row.querySelector(".sv-thumb");
          if (thumb && !thumb.querySelector(".sv-dl-badge")) {
            thumb.insertAdjacentHTML("beforeend", `<div class="sv-dl-badge">✓</div>`);
          }
          // Klasör butonu ekle
          const actions = row.querySelector(".sv-actions");
          if (actions && base && !actions.querySelector(".sv-folder")) {
            actions.insertBefore(createFolderBtn(base), actions.querySelector(".sv-rm"));
          }
        }
      } catch { btn.textContent = origText; btn.disabled = false; }
    });
  });

  el.querySelectorAll(".sv-rm").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation(); btn.textContent = "..."; btn.disabled = true;
      try {
        await api("POST", "/unsave", { url: btn.dataset.url });
        savedItems = savedItems.filter(i => i.url !== btn.dataset.url);
        savedSelected.delete(btn.dataset.url);
        renderSaved(); toast("Kayıttan kaldırıldı");
      } catch { btn.textContent = "🗑"; btn.disabled = false; }
    });
  });

  el.querySelectorAll(".sv-folder").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      try { await api("GET", `/downloads/open-folder?path=${encodeURIComponent(btn.dataset.rel)}`); }
      catch (err) { toast(err.message, "err"); }
    });
  });

  updateSelBtn();
}

document.getElementById("btn-dl-all").addEventListener("click", async () => {
  const btn = document.getElementById("btn-dl-all");
  const filtered = savedFilter === "all" ? savedItems : savedItems.filter(i => String(i.type) === savedFilter);
  if (!filtered.length) return;

  btn.disabled = true;
  btn.textContent = "İndiriliyor...";

  let done = 0;
  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i];
    if (downloadedUrls.has(item.url)) { done++; continue; } // zaten indirilmiş, atla

    // Listedeki ilgili satırı bul
    const row = document.querySelector(`.sv-item[data-url="${CSS.escape(item.url)}"]`);
    const dlBtn = row?.querySelector(".sv-dl");
    const actions = row?.querySelector(".sv-actions");

    if (row) row.classList.add("sv-item-active");
    if (dlBtn) {
      dlBtn.disabled = true;
      dlBtn.innerHTML = `<span class="spin" style="width:12px;height:12px;border-width:2px"></span> İndiriliyor`;
      row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    try {
      const res = await api("POST", "/download/saved", { url: item.url });
      const filePath = res.file || (res.files && res.files[0]) || "";
      const relMatch = filePath.match(/Downloads\/instagram\/(.+)/);
      const rel = relMatch ? relMatch[1] : "";
      markDownloaded(item.url, rel);

      if (row) {
        row.classList.remove("sv-item-active");
        row.classList.add("sv-item-downloaded");
        const lbl = row.querySelector(".sv-info-top");
        if (lbl && !lbl.querySelector(".sv-downloaded-label")) {
          lbl.insertAdjacentHTML("beforeend", `<span class="sv-downloaded-label">✓ İndirildi</span>`);
        }
        const thumb = row.querySelector(".sv-thumb");
        if (thumb && !thumb.querySelector(".sv-dl-badge")) {
          thumb.insertAdjacentHTML("beforeend", `<div class="sv-dl-badge">✓</div>`);
        }
      }
      if (dlBtn) dlBtn.textContent = "✓ İndirildi";
      // Klasör butonu ekle
      if (actions && rel && !actions.querySelector(".sv-folder")) {
        actions.insertBefore(createFolderBtn(rel), actions.querySelector(".sv-rm"));
      }
      done++;
    } catch {
      if (row) row.classList.remove("sv-item-active");
      if (dlBtn) { dlBtn.textContent = "✗ Hata"; dlBtn.disabled = false; }
    }

    btn.textContent = `İndiriliyor ${done}/${filtered.length}`;
  }

  toast(`${done} dosya indirildi`, "ok");
  btn.textContent = "Tümünü İndir";
  btn.disabled = false;
});

document.getElementById("btn-sv-select-all").addEventListener("click", () => {
  const filtered = savedFilter === "all" ? savedItems : savedItems.filter(i => String(i.type) === savedFilter);
  const allSelected = filtered.every(i => savedSelected.has(i.url));
  if (allSelected) {
    filtered.forEach(i => savedSelected.delete(i.url));
  } else {
    filtered.forEach(i => savedSelected.add(i.url));
  }
  renderSaved();
});

document.getElementById("btn-sv-rm-selected").addEventListener("click", async () => {
  const btn = document.getElementById("btn-sv-rm-selected");
  const urls = [...savedSelected];
  if (!urls.length) return;
  btn.disabled = true;
  let done = 0;
  for (const url of urls) {
    try {
      await api("POST", "/unsave", { url });
      savedItems = savedItems.filter(i => i.url !== url);
      savedSelected.delete(url);
      done++;
      btn.textContent = `Kaldırılıyor ${done}/${urls.length}`;
    } catch {}
  }
  toast(`${done} gönderi kayıttan kaldırıldı`);
  btn.disabled = false;
  renderSaved();
});

// ── Takipçiler ────────────────────────────────────────────────
document.getElementById("btn-flw-load")?.addEventListener("click", loadFollowers);
document.getElementById("flw-search")?.addEventListener("input", e => {
  flwFilter = e.target.value.toLowerCase();
  renderFlw();
});
document.getElementById("flw-seg")?.querySelectorAll(".seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#flw-seg .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    flwTab = btn.dataset.tab;
    flwSelected.clear();
    const csvPanel = document.getElementById("flw-csv-panel");
    const flwGrid = document.getElementById("flw-grid");
    const searchRow = document.querySelector(".flw-search-row");
    const loadBtn = document.getElementById("btn-flw-load");
    const amountWrap = loadBtn?.closest(".flw-toolbar-right");
    const statCards = document.getElementById("flw-stat-cards");
    if (btn.dataset.tab === "csv") {
      csvPanel.style.display = "";
      flwGrid.style.display = "none";
      searchRow.style.display = "none";
      if (amountWrap) amountWrap.style.display = "none";
      if (statCards) statCards.style.display = "none";
    } else {
      csvPanel.style.display = "none";
      flwGrid.style.display = "";
      searchRow.style.display = "";
      if (amountWrap) amountWrap.style.display = "";
      if (statCards) statCards.style.display = "";
      renderFlw();
    }
  });
});

// Sıralama
document.getElementById("flw-sort")?.addEventListener("change", e => {
  flwSort = e.target.value;
  renderFlw();
});

// Dışa aktar CSV
document.getElementById("btn-flw-export")?.addEventListener("click", () => {
  const items = flwGetFiltered();
  if (!items.length) return;
  const csv = "username,full_name\n" + items.map(u => `${u.username},${u.full_name || ""}`).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `instagram_${flwTab}_${Date.now()}.csv`; a.click();
});

// Tümünü seç
document.getElementById("btn-flw-sel-all")?.addEventListener("click", () => {
  const items = flwGetFiltered();
  const allSel = items.every(u => flwSelected.has(u.username));
  if (allSel) { flwSelected.clear(); }
  else { items.forEach(u => flwSelected.add(u.username)); }
  renderFlw();
});

// Toplu işlem
document.getElementById("btn-flw-bulk-action")?.addEventListener("click", async () => {
  const btn = document.getElementById("btn-flw-bulk-action");
  const users = [...flwSelected];
  if (!users.length) return;
  btn.disabled = true;
  let done = 0;
  for (const u of users) {
    try {
      if (flwTab === "followers" || flwTab === "notfollowing") {
        await api("POST", "/remove-follower", { username: u });
        flwData.followers = flwData.followers.filter(x => x.username !== u);
      } else {
        await api("POST", "/unfollow", { username: u });
        flwData.following = flwData.following.filter(x => x.username !== u);
      }
      flwSelected.delete(u); done++;
      btn.textContent = `İşleniyor ${done}/${users.length}`;
    } catch {}
    await new Promise(r => setTimeout(r, 1200));
  }
  toast(`${done} kullanıcı işlendi`, "ok");
  btn.disabled = false;
  btn.textContent = "Seçilenleri İşle";
  renderFlw();
});

// ── CSV'den Takipçi Çıkarma ───────────────────────────────────
(function initCsvRemove() {
  const dropZone = document.getElementById("csv-drop-zone");
  const fileInput = document.getElementById("csv-file-input");
  const pasteArea = document.getElementById("csv-paste");
  const parseBtn = document.getElementById("btn-csv-parse");
  const resultEl = document.getElementById("csv-result");
  if (!dropZone) return;

  // Tıklayınca dosya seç
  dropZone.addEventListener("click", () => fileInput.click());

  // Drag & drop
  dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("csv-drop-over"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("csv-drop-over"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("csv-drop-over");
    const file = e.dataTransfer.files[0];
    if (file) readCsvFile(file);
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) readCsvFile(fileInput.files[0]);
  });

  parseBtn.addEventListener("click", () => {
    const text = pasteArea.value.trim();
    if (!text) return;
    const usernames = parseUsernames(text);
    renderCsvList(usernames, resultEl);
  });

  function readCsvFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const usernames = parseUsernames(e.target.result);
      pasteArea.value = usernames.join("\n");
      renderCsvList(usernames, resultEl);
    };
    reader.readAsText(file);
  }
})();

function parseUsernames(text) {
  // CSV veya düz metin — username/kullanici_adi sütununu veya her satırı al
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  // İlk satır header mı?
  const header = lines[0].toLowerCase().split(/[,;\t]/);
  const usernameCol = header.findIndex(h => /^(username|kullanici|user|handle|@)/.test(h.trim()));

  if (usernameCol >= 0) {
    // CSV formatı — username sütununu çek
    return lines.slice(1).map(line => {
      const cols = line.split(/[,;\t]/);
      return (cols[usernameCol] || "").replace(/^@/, "").trim();
    }).filter(Boolean);
  } else {
    // Düz liste — her satır bir kullanıcı adı
    return lines.map(l => l.split(/[,;\t]/)[0].replace(/^@/, "").trim()).filter(Boolean);
  }
}

function renderCsvList(usernames, resultEl) {
  if (!usernames.length) {
    resultEl.innerHTML = msgEl("err", "Kullanıcı adı bulunamadı. CSV'de 'username' sütunu veya düz liste bekleniyor.");
    return;
  }

  const STORAGE_KEY = "csv_removed_users";
  const savedRemoved = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));

  let removeResults = {};
  usernames.forEach(u => { removeResults[u] = savedRemoved.has(u) ? "ok" : "pending"; });

  let csvStopRequested = false;
  let profileCache = {}; // username → { pic, full_name, followed_by }

  const avatarHTML = (u) => {
    const p = profileCache[u];
    if (p?.pic) return `<img src="${proxyImg(p.pic)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy" /><div class="csv-avatar-fallback" style="display:none">👤</div>`;
    return `<div class="csv-avatar-fallback">👤</div>`;
  };

  const followBadgeHTML = (u) => {
    const p = profileCache[u];
    if (!p || p.followed_by === undefined) return "";
    return p.followed_by
      ? `<span class="csv-follow-badge follows">Takip ediyor</span>`
      : `<span class="csv-follow-badge not-follows">Takip etmiyor</span>`;
  };

  const render = () => {
    const okCount = Object.values(removeResults).filter(v => v === "ok").length;
    const errCount = Object.values(removeResults).filter(v => v === "err").length;
    const pendingCount = Object.values(removeResults).filter(v => v === "pending").length;

    resultEl.innerHTML = `
      <div class="csv-list-header">
        <span>${usernames.length} kullanıcı yüklendi</span>
        <div class="csv-list-stats">
          ${okCount ? `<span class="csv-stat ok">✓ ${okCount} çıkarıldı</span>` : ""}
          ${errCount ? `<span class="csv-stat err">✗ ${errCount} hata</span>` : ""}
          ${pendingCount ? `<span class="csv-stat pending">⏳ ${pendingCount} bekliyor</span>` : ""}
        </div>
        <button class="btn-outline sm" id="btn-csv-stop" style="display:none">⏹ Durdur</button>
        <button class="btn-grad sm" id="btn-csv-remove-all" ${pendingCount === 0 ? "disabled" : ""}>
          Tümünü Takipten Çıkar (${pendingCount})
        </button>
      </div>
      <div class="csv-user-list">
        ${usernames.map(u => `
          <div class="csv-user-row" id="csv-row-${u}">
            <div class="csv-avatar">${avatarHTML(u)}</div>
            <div class="csv-user-info">
              <a class="csv-user-name csv-profile-link" href="https://instagram.com/${u}" target="_blank">@${u}${followBadgeHTML(u)}</a>
              ${profileCache[u]?.full_name ? `<div class="csv-user-full">${profileCache[u].full_name}</div>` : ""}
            </div>
            <span class="csv-user-status csv-status-${removeResults[u]}">
              ${removeResults[u] === "ok" ? "✓ Çıkarıldı" : removeResults[u] === "err" ? "✗ Hata" : "Bekliyor"}
            </span>
            <button class="btn-danger sm csv-remove-one" data-u="${u}" ${removeResults[u] !== "pending" ? "disabled" : ""}>
              Çıkar
            </button>
          </div>`).join("")}
      </div>`;

    resultEl.querySelectorAll(".csv-remove-one").forEach(btn => {
      btn.addEventListener("click", () => removeSingle(btn.dataset.u));
    });
    document.getElementById("btn-csv-remove-all")?.addEventListener("click", removeAll);
    document.getElementById("btn-csv-stop")?.addEventListener("click", () => {
      csvStopRequested = true;
    });
  };

  const updateHeader = () => {
    const okCount = Object.values(removeResults).filter(v => v === "ok").length;
    const errCount = Object.values(removeResults).filter(v => v === "err").length;
    const pendingCount = Object.values(removeResults).filter(v => v === "pending").length;
    const statsEl = resultEl.querySelector(".csv-list-stats");
    if (statsEl) statsEl.innerHTML = `
      ${okCount ? `<span class="csv-stat ok">✓ ${okCount} çıkarıldı</span>` : ""}
      ${errCount ? `<span class="csv-stat err">✗ ${errCount} hata</span>` : ""}
      ${pendingCount ? `<span class="csv-stat pending">⏳ ${pendingCount} bekliyor</span>` : ""}`;
    const allBtn = document.getElementById("btn-csv-remove-all");
    if (allBtn) { allBtn.disabled = pendingCount === 0; allBtn.textContent = `Tümünü Takipten Çıkar (${pendingCount})`; }
  };

  // Profil + friendship bilgisini arka planda çek
  const fetchProfiles = async () => {
    for (const u of usernames) {
      if (csvStopRequested) break;
      if (profileCache[u]?.followed_by !== undefined) continue;
      try {
        const [prof, friend] = await Promise.all([
          api("GET", `/profile/${u}`),
          api("GET", `/friendship/${u}`)
        ]);
        profileCache[u] = { pic: prof.profile_pic, full_name: prof.full_name, followed_by: friend.followed_by };
        const row = document.getElementById(`csv-row-${u}`);
        if (row) {
          const av = row.querySelector(".csv-avatar");
          if (av) av.innerHTML = avatarHTML(u);
          const nameEl = row.querySelector(".csv-user-name");
          if (nameEl) nameEl.innerHTML = `@${u}${followBadgeHTML(u)}`;
          const info = row.querySelector(".csv-user-info");
          if (info && prof.full_name && !info.querySelector(".csv-user-full")) {
            info.insertAdjacentHTML("beforeend", `<div class="csv-user-full">${prof.full_name}</div>`);
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 400));
    }
  };

  const removeSingle = async (username) => {
    const row = document.getElementById(`csv-row-${username}`);
    const statusEl = row?.querySelector(".csv-user-status");
    const btn = row?.querySelector(".csv-remove-one");
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.innerHTML = `<span class="spin" style="width:11px;height:11px;border-width:2px"></span>`;
    try {
      await api("POST", "/remove-follower", { username });
      removeResults[username] = "ok";
      savedRemoved.add(username);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...savedRemoved]));
      if (profileCache[username]) profileCache[username].followed_by = false;
    } catch {
      removeResults[username] = "err";
    }
    const row2 = document.getElementById(`csv-row-${username}`);
    if (row2) {
      const st = row2.querySelector(".csv-user-status");
      st.className = `csv-user-status csv-status-${removeResults[username]}`;
      st.textContent = removeResults[username] === "ok" ? "✓ Çıkarıldı" : "✗ Hata";
      row2.querySelector(".csv-remove-one").disabled = true;
      const nameEl = row2.querySelector(".csv-user-name");
      if (nameEl) nameEl.innerHTML = `@${username}${followBadgeHTML(username)}`;
    }
    updateHeader();
  };

  const removeAll = async () => {
    csvStopRequested = false;
    const stopBtn = document.getElementById("btn-csv-stop");
    const allBtn = document.getElementById("btn-csv-remove-all");
    if (stopBtn) stopBtn.style.display = "";
    if (allBtn) allBtn.disabled = true;

    const pending = usernames.filter(u => removeResults[u] === "pending");
    for (const u of pending) {
      if (csvStopRequested) break;
      await removeSingle(u);
      if (!csvStopRequested) await new Promise(r => setTimeout(r, 1500));
    }

    if (stopBtn) stopBtn.style.display = "none";
    const pendingLeft = Object.values(removeResults).filter(v => v === "pending").length;
    if (allBtn) { allBtn.disabled = pendingLeft === 0; }
    toast(csvStopRequested ? "Durduruldu" : "İşlem tamamlandı", "ok");
    csvStopRequested = false;
  };

  render();
  fetchProfiles();
}

async function loadFollowers() {
  const el = document.getElementById("flw-grid");
  if (!el) return;
  const amountVal = parseInt(document.getElementById("flw-amount")?.value || "200");
  const loadAll = amountVal === 0;
  const pageSize = 20;

  // Önceki yüklemeyi iptal et (race condition önlemi)
  flwLoadCancelled = true;
  await new Promise(r => setTimeout(r, 50));

  flwData.followers = [];
  flwData.following = [];
  flwLoadCancelled = false;
  el.innerHTML = `<div class="loading"><div class="spin"></div> Yükleniyor...</div>`;
  renderFlwStats();

  const loadBtn = document.getElementById("btn-flw-load");
  loadBtn.disabled = false;

  // Varsa eski stop butonunu kaldır
  document.getElementById("btn-flw-stop")?.remove();

  const stopBtn = document.createElement("button");
  stopBtn.id = "btn-flw-stop";
  stopBtn.className = "btn-outline sm";
  stopBtn.style.marginLeft = "8px";
  stopBtn.textContent = "Durdur";
  stopBtn.onclick = () => { flwLoadCancelled = true; };
  loadBtn.insertAdjacentElement("afterend", stopBtn);
  loadBtn.disabled = true;

  const cleanup = () => {
    document.getElementById("btn-flw-stop")?.remove();
    loadBtn.disabled = false;
  };

  try {
    const me = await api("GET", "/me");
    const u = me.username;

    // ── Takipçileri çek ──
    let fCursor = "";
    while (!flwLoadCancelled) {
      const d = await api("POST", "/followers/page", { username: u, max_id: fCursor, amount: pageSize });
      if (d.items?.length) { flwData.followers.push(...d.items); renderFlw(); }
      fCursor = d.next_max_id || "";
      if (!d.has_more || !fCursor || (!loadAll && flwData.followers.length >= amountVal)) break;
      await new Promise(r => setTimeout(r, 2000));
    }

    if (flwLoadCancelled) { cleanup(); renderFlw(); return; }

    // ── Takip edilenleri çek ──
    let fwCursor = "";
    while (!flwLoadCancelled) {
      const d = await api("POST", "/following/page", { username: u, max_id: fwCursor, amount: pageSize });
      if (d.items?.length) { flwData.following.push(...d.items); renderFlw(); }
      fwCursor = d.next_max_id || "";
      if (!d.has_more || !fwCursor || (!loadAll && flwData.following.length >= amountVal)) break;
      await new Promise(r => setTimeout(r, 2000));
    }

    cleanup();
    renderFlw();
  } catch (e) {
    cleanup();
    el.innerHTML = msgEl("err", e.message);
    toast(e.message, "err");
  }
}

function renderFlwStats() {
  const followerSet = new Set(flwData.followers.map(u => u.username));
  const notFollowingBack = flwData.following.filter(u => !followerSet.has(u.username)).length;
  const mutual = flwData.following.filter(u => followerSet.has(u.username)).length;

  // Küçük stat pill'ler (arama satırında)
  const statsEl = document.getElementById("flw-stats");
  if (statsEl) {
    statsEl.innerHTML = flwData.followers.length || flwData.following.length ? `
      <div class="flw-stats-row">
        <div class="flw-stat-pill">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <span class="flw-stat-num">${flwData.followers.length}</span> takipçi
        </div>
        <div class="flw-stat-pill">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          <span class="flw-stat-num">${flwData.following.length}</span> takip
        </div>
        ${mutual > 0 ? `<div class="flw-stat-pill" style="color:var(--green);border-color:var(--green-bd);background:var(--green-bg)">
          <span class="flw-stat-num" style="color:var(--green)">${mutual}</span> karşılıklı
        </div>` : ""}
        ${notFollowingBack > 0 ? `<div class="flw-stat-pill flw-stat-warn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span class="flw-stat-num">${notFollowingBack}</span> geri takip etmiyor
        </div>` : ""}
      </div>` : "";
  }

  // Büyük istatistik kartları — sadece değerler güncellenir, DOM yeniden yazılmaz
  const cardsEl = document.getElementById("flw-stat-cards");
  if (!cardsEl) return;
  if (!(flwData.followers.length || flwData.following.length)) return;

  // İlk yüklemede kartları oluştur
  if (!cardsEl.querySelector(".flw-sc")) {
    cardsEl.innerHTML = `
      <div class="flw-sc" onclick="switchFlwTab('followers')">
        <div class="flw-sc-icon" style="background:linear-gradient(135deg,#f09433,#e1306c)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </div>
        <div class="flw-sc-val" id="flw-sc-val-followers">${flwData.followers.length}</div>
        <div class="flw-sc-lbl">Takipçi</div>
      </div>
      <div class="flw-sc" onclick="switchFlwTab('following')">
        <div class="flw-sc-icon" style="background:linear-gradient(135deg,#e1306c,#7c3aed)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </div>
        <div class="flw-sc-val" id="flw-sc-val-following">${flwData.following.length}</div>
        <div class="flw-sc-lbl">Takip Edilen</div>
      </div>
      <div class="flw-sc" onclick="switchFlwTab('mutual')">
        <div class="flw-sc-icon" style="background:linear-gradient(135deg,#16a34a,#059669)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </div>
        <div class="flw-sc-val" id="flw-sc-val-mutual">${mutual}</div>
        <div class="flw-sc-lbl">Karşılıklı</div>
      </div>
      <div class="flw-sc flw-sc-warn" onclick="switchFlwTab('notfollowing')">
        <div class="flw-sc-icon" style="background:linear-gradient(135deg,#dc2626,#b91c1c)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="flw-sc-val" id="flw-sc-val-notfollowing">${notFollowingBack}</div>
        <div class="flw-sc-lbl">Geri Takip Etmiyor</div>
      </div>`;
  } else {
    // Sadece değerleri güncelle
    const v = id => document.getElementById(id);
    if (v("flw-sc-val-followers")) v("flw-sc-val-followers").textContent = flwData.followers.length;
    if (v("flw-sc-val-following")) v("flw-sc-val-following").textContent = flwData.following.length;
    if (v("flw-sc-val-mutual")) v("flw-sc-val-mutual").textContent = mutual;
    if (v("flw-sc-val-notfollowing")) v("flw-sc-val-notfollowing").textContent = notFollowingBack;
  }
}

function switchFlwTab(tab) {
  document.querySelectorAll("#flw-seg .seg-btn").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`#flw-seg .seg-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add("active");
  flwTab = tab;
  flwSelected.clear();
  renderFlw();
}

function flwGetFiltered() {
  const followerSet = new Set(flwData.followers.map(u => u.username));
  const followingSet = new Set(flwData.following.map(u => u.username));
  let items = [];
  if (flwTab === "followers")      items = flwData.followers;
  else if (flwTab === "following") items = flwData.following;
  else if (flwTab === "notfollowing") items = flwData.following.filter(u => !followerSet.has(u.username));
  else if (flwTab === "mutual")    items = flwData.following.filter(u => followerSet.has(u.username));
  else items = flwData.followers;

  if (flwFilter) items = items.filter(u =>
    u.username.toLowerCase().includes(flwFilter) ||
    (u.full_name || "").toLowerCase().includes(flwFilter)
  );

  if (flwSort === "az") items = [...items].sort((a, b) => a.username.localeCompare(b.username));
  else if (flwSort === "za") items = [...items].sort((a, b) => b.username.localeCompare(a.username));

  return items;
}

function renderFlw() {
  const el = document.getElementById("flw-grid");
  renderFlwStats();

  const items = flwGetFiltered();
  const bulkTools = document.getElementById("flw-bulk-tools");
  const exportBtn = document.getElementById("btn-flw-export");
  const selCountEl = document.getElementById("flw-sel-count");
  const selAllBtn = document.getElementById("btn-flw-sel-all");
  const bulkBtn = document.getElementById("btn-flw-bulk-action");

  // Araçları göster/gizle
  if (bulkTools) bulkTools.style.display = items.length ? "flex" : "none";
  if (exportBtn) exportBtn.style.display = items.length ? "" : "none";

  // Seçim sayacı
  const selCount = items.filter(u => flwSelected.has(u.username)).length;
  if (selCountEl) selCountEl.textContent = selCount > 0 ? `${selCount} seçili` : "";
  if (selAllBtn) selAllBtn.textContent = items.length && items.every(u => flwSelected.has(u.username)) ? "Seçimi Kaldır" : "Tümünü Seç";
  if (bulkBtn) {
    const actionLabel = (flwTab === "followers" || flwTab === "notfollowing") ? "Çıkar" : "Takibi Bırak";
    bulkBtn.textContent = selCount > 0 ? `${selCount} Kişiyi ${actionLabel}` : "Seçilenleri İşle";
    bulkBtn.style.display = selCount > 0 ? "" : "none";
  }

  if (!items.length) {
    el.innerHTML = `<div class="flw-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <p>${flwFilter ? "Filtre ile eşleşen kullanıcı yok." : "Yüklemek için Yükle butonuna bas."}</p>
    </div>`;
    return;
  }

  const followerSet = new Set(flwData.followers.map(u => u.username));
  const followingSet = new Set(flwData.following.map(u => u.username));

  el.innerHTML = items.map(u => {
    const isSel = flwSelected.has(u.username);
    const isMutual = followerSet.has(u.username) && followingSet.has(u.username);
    const followsMe = followerSet.has(u.username);
    const iFollow = followingSet.has(u.username);

    let actionBtn = "";
    if (flwTab === "followers") {
      actionBtn = `<button class="flw-btn-remove flw-remove" data-u="${u.username}">Çıkar</button>`;
    } else if (flwTab === "mutual") {
      actionBtn = `<button class="flw-btn-unfollow flw-unfollow" data-u="${u.username}">Bırak</button>`;
    } else if (flwTab === "notfollowing") {
      actionBtn = `<button class="flw-btn-unfollow flw-unfollow" data-u="${u.username}">Takibi Bırak</button>`;
    } else {
      actionBtn = `<button class="flw-btn-unfollow flw-unfollow" data-u="${u.username}">Bırak</button>`;
    }

    return `
    <div class="flw-card ${isSel ? "flw-card-selected" : ""}" data-u="${u.username}">
      <input type="checkbox" class="flw-cb" ${isSel ? "checked" : ""} />
      <div class="flw-card-avatar">
        <img src="${proxyImg(u.pic)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy" />
        <div class="flw-card-avatar-fallback" style="display:none">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        </div>
        ${isMutual ? `<div class="flw-mutual-dot" title="Karşılıklı takip"></div>` : ""}
      </div>
      <div class="flw-card-info">
        <div class="flw-card-username">@${u.username}
          ${isMutual ? `<span class="flw-badge mutual">↔ Karşılıklı</span>` : ""}
          ${followsMe && !iFollow ? `<span class="flw-badge follows-me">Seni takip ediyor</span>` : ""}
        </div>
        ${u.full_name ? `<div class="flw-card-fullname">${u.full_name}</div>` : ""}
      </div>
      <div class="flw-card-actions">
        ${actionBtn}
        <a class="flw-btn-profile" href="https://instagram.com/${u.username}" target="_blank" title="Profili aç">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
      </div>
    </div>`;
  }).join("");

  // Checkbox ile seçim
  el.querySelectorAll(".flw-card").forEach(card => {
    const cb = card.querySelector(".flw-cb");
    const toggle = () => {
      const u = card.dataset.u;
      if (flwSelected.has(u)) { flwSelected.delete(u); card.classList.remove("flw-card-selected"); cb.checked = false; }
      else { flwSelected.add(u); card.classList.add("flw-card-selected"); cb.checked = true; }
      // Sayacı güncelle (full re-render yok)
      const selCount = [...flwSelected].filter(x => items.find(i => i.username === x)).length;
      const selCountEl = document.getElementById("flw-sel-count");
      if (selCountEl) selCountEl.textContent = selCount > 0 ? `${selCount} seçili` : "";
      const bulkBtn = document.getElementById("btn-flw-bulk-action");
      if (bulkBtn) {
        const actionLabel = (flwTab === "followers" || flwTab === "notfollowing") ? "Çıkar" : "Takibi Bırak";
        bulkBtn.textContent = selCount > 0 ? `${selCount} Kişiyi ${actionLabel}` : "Seçilenleri İşle";
        bulkBtn.style.display = selCount > 0 ? "" : "none";
      }
    };
    cb.addEventListener("change", toggle);
    card.addEventListener("click", e => {
      if (e.target.closest(".flw-card-actions") || e.target.tagName === "A") return;
      toggle();
    });
  });

  el.querySelectorAll(".flw-remove").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const u = btn.dataset.u;
      btn.disabled = true; btn.textContent = "...";
      try {
        await api("POST", "/remove-follower", { username: u });
        flwData.followers = flwData.followers.filter(x => x.username !== u);
        flwSelected.delete(u);
        toast(`@${u} takipçilerden çıkarıldı`);
        renderFlw();
      } catch (e) { toast(e.message, "err"); btn.disabled = false; btn.textContent = "Çıkar"; }
    });
  });

  el.querySelectorAll(".flw-unfollow").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const u = btn.dataset.u;
      btn.disabled = true; btn.textContent = "...";
      try {
        await api("POST", "/unfollow", { username: u });
        flwData.following = flwData.following.filter(x => x.username !== u);
        flwSelected.delete(u);
        toast(`@${u} takibi bırakıldı`);
        renderFlw();
      } catch (e) { toast(e.message, "err"); btn.disabled = false; btn.textContent = "Bırak"; }
    });
  });
}

// ── Mesajlar ──────────────────────────────────────────────────
document.getElementById("btn-dm-send").addEventListener("click", async () => {
  const to = document.getElementById("dm-to").value.trim();
  const text = document.getElementById("dm-text").value.trim();
  const el = document.getElementById("dm-result");
  if (!to || !text) return;
  loading(el);
  try {
    await api("POST", "/dm/send", { username: to, text });
    el.innerHTML = msgEl("ok", "✓ Mesaj gönderildi");
    document.getElementById("dm-text").value = "";
    toast("Mesaj gönderildi", "ok");
  } catch (e) { el.innerHTML = msgEl("err", e.message); }
});

document.getElementById("btn-inbox").addEventListener("click", async () => {
  const el = document.getElementById("inbox-list");
  loading(el);
  try {
    const d = await api("GET", "/inbox");
    if (!d.items.length) { el.innerHTML = `<p style="color:var(--muted)">Mesaj yok.</p>`; return; }
    el.innerHTML = d.items.map(t => `
      <div class="inbox-item">
        <div class="inbox-users">${t.users.map(u => "@" + u).join(", ")}</div>
        <div class="inbox-last">${t.last_message}</div>
      </div>`).join("");
  } catch (e) { el.innerHTML = msgEl("err", e.message); }
});

// ── Zamanlayıcı ───────────────────────────────────────────────
document.getElementById("btn-sch-add").addEventListener("click", async () => {
  const user = document.getElementById("sch-user").value.trim();
  const interval = parseInt(document.getElementById("sch-interval").value) || 60;
  const el = document.getElementById("sch-result");
  if (!user) return;
  loading(el);
  try {
    await api("POST", "/schedulers", { username: user, interval_minutes: interval });
    el.innerHTML = msgEl("ok", `✓ @${user} için zamanlayıcı eklendi`);
    document.getElementById("sch-user").value = "";
    toast("Zamanlayıcı eklendi", "ok");
    loadSchedulers();
  } catch (e) { el.innerHTML = msgEl("err", e.message); }
});

document.getElementById("btn-sch-load").addEventListener("click", loadSchedulers);

async function loadSchedulers() {
  const el = document.getElementById("sch-list");
  loading(el);
  try {
    const d = await api("GET", "/schedulers");
    if (!d.items.length) { el.innerHTML = `<p style="color:var(--muted);padding:12px 0">Zamanlayıcı yok.</p>`; return; }
    el.innerHTML = d.items.map(s => `
      <div class="sch-row">
        <div>
          <div class="sch-row-user">@${s.username}</div>
          <div class="sch-row-detail">Her ${s.interval_minutes} dakikada story indir</div>
        </div>
        <button class="btn-danger sch-del" data-u="${s.username}">Sil</button>
      </div>`).join("");
    el.querySelectorAll(".sch-del").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.textContent = "..."; btn.disabled = true;
        try { await api("DELETE", `/schedulers/${btn.dataset.u}`); toast("Silindi"); loadSchedulers(); }
        catch { btn.textContent = "Hata"; btn.disabled = false; }
      });
    });
  } catch (e) { el.innerHTML = msgEl("err", e.message); }
}

// ── İndirilenler ─────────────────────────────────────────────
let dlItems = [], dlTypeFilter = "all", dlTextFilter = "";

document.getElementById("btn-dl-refresh").addEventListener("click", loadDownloads);
document.getElementById("btn-dl-open-folder").addEventListener("click", async () => {
  try { await api("GET", "/downloads/open-folder"); }
  catch (e) { toast(e.message, "err"); }
});
document.getElementById("dl-filter-text").addEventListener("input", e => {
  dlTextFilter = e.target.value.toLowerCase();
  renderDownloads();
});
document.getElementById("dl-type-seg").querySelectorAll(".seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#dl-type-seg .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    dlTypeFilter = btn.dataset.filter;
    renderDownloads();
  });
});

async function loadDownloads() {
  const el = document.getElementById("dl-list");
  const stats = document.getElementById("dl-stats");
  loading(el); stats.innerHTML = "";
  try {
    const d = await api("GET", "/downloads/list");
    dlItems = d.items || [];
    try {
      renderDownloads();
    } catch (re) {
      console.error("renderDownloads hatası:", re);
      el.innerHTML = msgEl("err", "Görüntüleme hatası: " + re.message);
    }
  } catch (e) { el.innerHTML = msgEl("err", e.message); }
}

function renderDownloads() {
  const el = document.getElementById("dl-list");
  const stats = document.getElementById("dl-stats");

  let filtered = dlItems;
  if (dlTypeFilter !== "all") filtered = filtered.filter(i => i.type === dlTypeFilter);
  if (dlTextFilter) filtered = filtered.filter(i => i.name.toLowerCase().includes(dlTextFilter));

  const total = filtered.length;
  const images = filtered.filter(i => i.type === "image").length;
  const videos = filtered.filter(i => i.type === "video").length;
  const totalSize = filtered.reduce((s, i) => s + i.size, 0);
  stats.innerHTML = `
    <div class="dl-stat-pill">📁 <b>${total}</b> <span>dosya</span></div>
    <div class="dl-stat-pill">🖼 <b>${images}</b> <span>fotoğraf</span></div>
    <div class="dl-stat-pill">🎬 <b>${videos}</b> <span>video</span></div>
    <div class="dl-stat-pill">💾 <b>${fmtSize(totalSize)}</b> <span>toplam</span></div>`;

  if (!filtered.length) {
    el.innerHTML = `<div class="dl-empty"><div class="dl-empty-icon">📂</div>Henüz indirilmiş dosya yok.</div>`;
    return;
  }

  el.innerHTML = filtered.map(item => {
    const fileUrl = `${API}${item.url}`;
    const folder = item.rel.includes("/") ? item.rel.split("/").slice(0, -1).join("/") : "—";
    const date = new Date(item.mtime * 1000).toLocaleString("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    const thumb = item.type === "image"
      ? `<img class="dl-item-thumb" src="${fileUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy" /><div class="dl-item-thumb-placeholder" style="display:none">🖼</div>`
      : `<div class="dl-item-thumb-placeholder">🎬</div>`;
    return `
      <div class="dl-item" data-rel="${item.rel}">
        ${thumb}
        <div class="dl-item-info">
          <div class="dl-item-name" title="${item.name}">${item.name}</div>
          <div class="dl-item-path" title="${item.path}">${item.path}</div>
          <div class="dl-item-meta">
            <span class="dl-item-badge ${item.type}">${item.type === "image" ? "🖼 Fotoğraf" : "🎬 Video"}</span>
            <span class="dl-item-badge size">💾 ${fmtSize(item.size)}</span>
            <span class="dl-item-badge date">🕐 ${date}</span>
            ${folder !== "—" ? `<span class="dl-item-badge folder">📁 ${folder}</span>` : ""}
          </div>
        </div>
        <div class="dl-item-actions">
          ${item.instagram_url
            ? `<a class="btn-grad sm" href="${item.instagram_url}" target="_blank" title="Instagram'da aç">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>
                Instagram
              </a>`
            : `<a class="btn-outline sm" href="${fileUrl}" target="_blank" title="Tarayıcıda önizle">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Aç
              </a>`
          }
          <button class="btn-outline sm dl-open-folder" data-rel="${item.rel}" title="Klasörde göster">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Klasör
          </button>
          <button class="btn-danger dl-del" data-rel="${item.rel}" title="Sil">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>`;
  }).join("");

  el.querySelectorAll(".dl-open-folder").forEach(btn => {
    btn.addEventListener("click", async () => {
      try { await api("GET", `/downloads/open-folder?path=${encodeURIComponent(btn.dataset.rel)}`); }
      catch (e) { toast(e.message, "err"); }
    });
  });

  el.querySelectorAll(".dl-del").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await api("DELETE", `/downloads/file/${btn.dataset.rel}`);
        dlItems = dlItems.filter(i => i.rel !== btn.dataset.rel);
        renderDownloads();
        toast("Dosya silindi");
      } catch (e) { toast(e.message, "err"); btn.disabled = false; }
    });
  });
}

function fmtSize(bytes) {
  if (bytes >= 1024 ** 3) return (bytes / (1024 ** 3)).toFixed(1) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / (1024 ** 2)).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

// ── Login Ekranı Hızlı İndirme ────────────────────────────────
(function initLoginDl() {
  const input = document.getElementById("login-dl-input");
  const hint = document.getElementById("login-dl-hint");
  const btn = document.getElementById("btn-login-dl");
  if (!input) return;

  input.addEventListener("input", () => {
    const q = input.value.trim();
    const type = detectInputType(q);
    const labels = {
      url: "🔗 Post / Reel indirilecek",
      hashtag: "# Hashtag aranacak",
      username: "🔒 Story için giriş gerekli",
      location: "📍 Konum aranacak"
    };
    hint.textContent = type ? labels[type] : "";

    // URL girilince otomatik önizle
    if (type === "url") {
      clearTimeout(input._previewTimer);
      input._previewTimer = setTimeout(() => doLoginDlPreview(), 600);
    } else {
      document.getElementById("login-dl-preview").innerHTML = "";
    }
  });

  input.addEventListener("keydown", e => { if (e.key === "Enter") doLoginDlSearch(); });
  btn.addEventListener("click", doLoginDlSearch);
})();

async function doLoginDlPreview() {
  const q = document.getElementById("login-dl-input").value.trim();
  const previewEl = document.getElementById("login-dl-preview");
  const resEl = document.getElementById("login-dl-result");
  if (!q || detectInputType(q) !== "url") return;
  previewEl.innerHTML = `<div style="padding:16px"><div class="loading"><div class="spin"></div> Medya bilgisi alınıyor...</div></div>`;
  resEl.innerHTML = "";
  try {
    const d = await api("POST", "/media/info", { url: q });
    const typeLabel = { photo: "📷 Fotoğraf", video: "🎬 Video", album: "📚 Albüm" }[d.type] || "📷";
    const date = d.taken_at ? new Date(d.taken_at).toLocaleString("tr-TR", { day:"2-digit", month:"long", year:"numeric" }) : "";
    previewEl.innerHTML = `
      <div class="dl-preview-card" style="margin-top:12px">
        <div class="dl-preview-top">
          <div class="dl-preview-thumb-wrap" style="width:120px;height:120px">
            ${d.thumbnail ? `<img src="${proxyImg(d.thumbnail)}" onerror="this.style.display='none'" />` : ""}
            <div class="dl-preview-type-badge">${typeLabel}</div>
          </div>
          <div class="dl-preview-info">
            <div class="dl-preview-user">
              ${d.user_pic ? `<img src="${proxyImg(d.user_pic)}" onerror="this.style.display='none'" />` : ""}
              <div>
                <div class="dl-preview-username">@${d.username}</div>
                ${date ? `<div class="dl-preview-date">${date}</div>` : ""}
              </div>
            </div>
            ${d.caption ? `<div class="dl-preview-caption">${d.caption}</div>` : ""}
            <div class="dl-preview-stats">
              <div class="dl-preview-stat">❤️ ${fmt(d.likes)} <span>beğeni</span></div>
              <div class="dl-preview-stat">💬 ${fmt(d.comments)} <span>yorum</span></div>
            </div>
          </div>
        </div>
      </div>`;
  } catch (e) {
    previewEl.innerHTML = "";
    resEl.innerHTML = msgEl("err", e.message);
  }
}

async function doLoginDlSearch() {
  const q = document.getElementById("login-dl-input").value.trim();
  const resEl = document.getElementById("login-dl-result");
  const gridEl = document.getElementById("login-dl-grid");
  const locEl = document.getElementById("login-dl-loc");
  const previewEl = document.getElementById("login-dl-preview");
  const txt = document.getElementById("login-dl-txt");
  const spin = document.getElementById("login-dl-spin");
  if (!q) return;
  const type = detectInputType(q);
  resEl.innerHTML = ""; gridEl.innerHTML = ""; locEl.innerHTML = "";
  txt.classList.add("hidden"); spin.classList.remove("hidden");
  try {
    if (type === "url") {
      const d = await api("POST", "/download/post", { url: q });
      const files = d.files || (d.file ? [d.file] : []);
      const names = files.map(f => f.split("/").pop()).join(", ");
      previewEl.innerHTML = "";
      resEl.innerHTML = `
        <div class="dl-success-card" style="margin-top:12px">
          ${d.thumbnail ? `<img src="${proxyImg(d.thumbnail)}" onerror="this.style.display='none'" />` : `<div class="dl-success-icon">${d.type === "video" ? "🎬" : d.type === "album" ? "📚" : "📷"}</div>`}
          <div class="dl-success-info">
            <div class="dl-success-title">✓ Başarıyla İndirildi</div>
            <div class="dl-success-files">${names}</div>
            <div class="dl-success-count">${files.length} dosya • ${d.type === "album" ? "Albüm" : d.type === "video" ? "Video" : "Fotoğraf"}</div>
          </div>
        </div>`;
      toast("İndirildi", "ok");
    } else if (type === "hashtag") {
      const tag = q.replace("#", "");
      loading(gridEl);
      const d = await api("POST", "/search/hashtag", { tag, amount: 12 });
      gridEl.innerHTML = d.items.length
        ? d.items.map(mediaItemHTML).join("")
        : `<p style="color:var(--muted)">Sonuç bulunamadı.</p>`;
      bindGridDl(gridEl);
    } else if (type === "username") {
      // Story indirmek için giriş gerekli
      resEl.innerHTML = `
        <div class="dl-login-prompt" style="margin-top:12px">
          <div class="dl-login-prompt-icon">🔒</div>
          <div class="dl-login-prompt-text">
            <div class="dl-login-prompt-title">Giriş Gerekli</div>
            <div class="dl-login-prompt-sub">Story indirmek için Instagram hesabınla giriş yapman gerekiyor.</div>
          </div>
          <button class="btn-grad sm" onclick="switchLoginTab('login')">Giriş Yap →</button>
        </div>`;
    } else {
      loading(locEl);
      const d = await api("GET", `/search/location/${encodeURIComponent(q)}`);
      locEl.innerHTML = locListHTML(d.items);
      bindLocButtons(locEl, gridEl);
    }
  } catch (e) { resEl.innerHTML = msgEl("err", e.message); }
  finally { txt.classList.remove("hidden"); spin.classList.add("hidden"); }
}

// ── Oturum kontrolü ───────────────────────────────────────────
api("GET", "/me").then(me => showDashboard(me)).catch(() => {
  // Session geçersiz — login ekranını göster (zaten görünür, bir şey yapma)
});

// ══════════════════════════════════════════════════════════════
// PAYLAŞ SAYFASI
// ══════════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────────
let pubMediaType = "photo";
let pubFilePath = null;          // tekli yükleme sonrası sunucu path
let pubAlbumPaths = [];          // albüm yükleme sonrası sunucu path listesi
let pubLocationPk = null;
let pubLocationName = null;
let pubTags = [];                // [{username, x, y}]

// ── Medya Tipi Seçici ─────────────────────────────────────────
document.querySelectorAll(".pub-type-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pub-type-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    pubMediaType = btn.dataset.type;
    pubUpdateUI();
  });
});

function pubUpdateUI() {
  const isAlbum = pubMediaType === "album";
  const isStory = pubMediaType.startsWith("story_");
  document.getElementById("pub-single-upload").style.display = isAlbum ? "none" : "";
  document.getElementById("pub-album-upload").style.display  = isAlbum ? "" : "none";
  document.getElementById("pub-caption-card").style.display  = isStory ? "none" : "";
  document.getElementById("pub-location-card").style.display = isStory ? "none" : "";
  document.getElementById("pub-usertag-card").style.display  = isStory ? "none" : "";

  // Accept güncelle
  const isVideo = pubMediaType === "video" || pubMediaType === "reel" || pubMediaType === "story_video";
  const isPhoto = pubMediaType === "photo" || pubMediaType === "story_photo";
  const accept = isVideo ? "video/*" : isPhoto ? "image/*" : "image/*,video/*";
  document.getElementById("pub-file-input").accept = accept;

  const subText = isVideo ? "MP4, MOV desteklenir" : isPhoto ? "JPG, PNG, WEBP desteklenir" : "JPG, PNG, MP4 desteklenir";
  document.getElementById("pub-drop-sub").textContent = subText;
}

// ── Tekli Dosya Drop Zone ─────────────────────────────────────
const pubDropZone = document.getElementById("pub-drop-zone");
const pubFileInput = document.getElementById("pub-file-input");

pubDropZone.addEventListener("click", () => pubFileInput.click());
pubDropZone.addEventListener("dragover", e => { e.preventDefault(); pubDropZone.classList.add("drag-over"); });
pubDropZone.addEventListener("dragleave", () => pubDropZone.classList.remove("drag-over"));
pubDropZone.addEventListener("drop", e => {
  e.preventDefault(); pubDropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) pubHandleSingleFile(file);
});
pubFileInput.addEventListener("change", () => {
  if (pubFileInput.files[0]) pubHandleSingleFile(pubFileInput.files[0]);
});

async function pubHandleSingleFile(file) {
  const preview = document.getElementById("pub-file-preview");
  const fmtSz = b => b >= 1048576 ? (b/1048576).toFixed(1)+" MB" : (b/1024).toFixed(0)+" KB";
  const isVideo = file.type.startsWith("video/");
  const objUrl = URL.createObjectURL(file);

  preview.style.display = "flex";
  preview.innerHTML = `
    ${isVideo
      ? `<video src="${objUrl}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0" muted></video>`
      : `<img src="${objUrl}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0" />`}
    <div class="pub-file-info">
      <div class="pub-file-name">${file.name}</div>
      <div class="pub-file-size">${fmtSz(file.size)}</div>
      <div id="pub-upload-status" style="font-size:11px;color:var(--muted);margin-top:4px">Yükleniyor...</div>
    </div>
    <button class="pub-file-remove" id="btn-pub-file-remove" title="Kaldır">✕</button>`;

  document.getElementById("btn-pub-file-remove").addEventListener("click", () => {
    preview.style.display = "none";
    preview.innerHTML = "";
    pubFilePath = null;
    pubFileInput.value = "";
  });

  // Backend'e yükle
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API}/publish/upload`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Yükleme hatası");
    pubFilePath = data.path;
    document.getElementById("pub-upload-status").textContent = "✓ Hazır";
    document.getElementById("pub-upload-status").style.color = "var(--green)";
  } catch (e) {
    document.getElementById("pub-upload-status").textContent = "✗ " + e.message;
    document.getElementById("pub-upload-status").style.color = "var(--red)";
    pubFilePath = null;
  }
}

// ── Albüm Drop Zone ───────────────────────────────────────────
const pubAlbumDrop = document.getElementById("pub-album-drop-zone");
const pubAlbumInput = document.getElementById("pub-album-input");

pubAlbumDrop.addEventListener("click", () => pubAlbumInput.click());
pubAlbumDrop.addEventListener("dragover", e => { e.preventDefault(); pubAlbumDrop.classList.add("drag-over"); });
pubAlbumDrop.addEventListener("dragleave", () => pubAlbumDrop.classList.remove("drag-over"));
pubAlbumDrop.addEventListener("drop", e => {
  e.preventDefault(); pubAlbumDrop.classList.remove("drag-over");
  pubHandleAlbumFiles([...e.dataTransfer.files]);
});
pubAlbumInput.addEventListener("change", () => {
  if (pubAlbumInput.files.length) pubHandleAlbumFiles([...pubAlbumInput.files]);
});

async function pubHandleAlbumFiles(files) {
  if (files.length > 10) { toast("Maksimum 10 dosya seçebilirsiniz", "err"); files = files.slice(0, 10); }
  const preview = document.getElementById("pub-album-preview");
  preview.innerHTML = `<div class="loading"><div class="spin"></div> Yükleniyor...</div>`;

  const formData = new FormData();
  files.forEach(f => formData.append("files", f));

  try {
    const res = await fetch(`${API}/publish/upload-album`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Yükleme hatası");
    pubAlbumPaths = data.files.map(f => f.path);

    preview.innerHTML = data.files.map((f, i) => {
      const isVideo = f.name.match(/\.(mp4|mov|webm)$/i);
      const fileUrl = `${API}/publish/preview/${encodeURIComponent(f.path.split("/").pop())}`;
      return `<div class="pub-album-item" data-idx="${i}">
        ${isVideo
          ? `<div style="width:100%;height:100%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:20px">🎬</div>`
          : `<img src="${API}/proxy/image?url=${encodeURIComponent(f.path)}" onerror="this.parentElement.innerHTML='🖼'" />`}
        <button class="pub-album-item-remove" data-idx="${i}">✕</button>
      </div>`;
    }).join("");

    preview.querySelectorAll(".pub-album-item-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        pubAlbumPaths.splice(idx, 1);
        btn.closest(".pub-album-item").remove();
        // idx'leri güncelle
        preview.querySelectorAll(".pub-album-item").forEach((el, i) => {
          el.dataset.idx = i;
          el.querySelector(".pub-album-item-remove").dataset.idx = i;
        });
      });
    });
    toast(`${data.files.length} dosya yüklendi`, "ok");
  } catch (e) {
    preview.innerHTML = msgEl("err", e.message);
    pubAlbumPaths = [];
  }
}

// ── Caption Sayacı ────────────────────────────────────────────
document.getElementById("pub-caption").addEventListener("input", function() {
  document.getElementById("pub-caption-count").textContent = `${this.value.length} / 2200`;
  if (this.value.length > 2200) this.value = this.value.slice(0, 2200);
});

// ── Konum Arama ───────────────────────────────────────────────
document.getElementById("btn-pub-loc-search").addEventListener("click", pubSearchLocation);
document.getElementById("pub-loc-search").addEventListener("keydown", e => { if (e.key === "Enter") pubSearchLocation(); });

async function pubSearchLocation() {
  const q = document.getElementById("pub-loc-search").value.trim();
  const el = document.getElementById("pub-loc-results");
  if (!q) return;
  loading(el);
  try {
    const d = await api("GET", `/search/location/${encodeURIComponent(q)}`);
    if (!d.items.length) { el.innerHTML = msgEl("err", "Konum bulunamadı."); return; }
    el.innerHTML = d.items.map(l => `
      <div class="pub-loc-item" data-pk="${l.pk}" data-name="${l.name}">
        <span>📍 ${l.name}</span>
        <button class="btn-outline sm">Seç</button>
      </div>`).join("");
    el.querySelectorAll(".pub-loc-item").forEach(item => {
      item.addEventListener("click", () => {
        pubLocationPk = item.dataset.pk;
        pubLocationName = item.dataset.name;
        el.innerHTML = "";
        document.getElementById("pub-loc-search").value = "";
        const sel = document.getElementById("pub-loc-selected");
        sel.style.display = "flex";
        sel.innerHTML = `📍 ${pubLocationName} <button class="pub-loc-clear" id="btn-pub-loc-clear">✕</button>`;
        document.getElementById("btn-pub-loc-clear").addEventListener("click", () => {
          pubLocationPk = null; pubLocationName = null;
          sel.style.display = "none";
        });
      });
    });
  } catch (e) { el.innerHTML = msgEl("err", e.message); }
}

// ── Kullanıcı Etiketleme ──────────────────────────────────────
document.getElementById("btn-pub-tag-add").addEventListener("click", pubAddTag);
document.getElementById("pub-tag-input").addEventListener("keydown", e => { if (e.key === "Enter") pubAddTag(); });

function pubAddTag() {
  const input = document.getElementById("pub-tag-input");
  const username = input.value.trim().replace("@", "");
  if (!username) return;
  if (pubTags.find(t => t.username === username)) { toast("Bu kullanıcı zaten eklendi"); return; }
  pubTags.push({ username, x: 0.5, y: 0.5 });
  input.value = "";
  pubRenderTags();
}

function pubRenderTags() {
  const el = document.getElementById("pub-tags-list");
  el.innerHTML = pubTags.map((t, i) => `
    <div class="pub-tag-chip">
      @${t.username}
      <button data-idx="${i}">✕</button>
    </div>`).join("");
  el.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      pubTags.splice(parseInt(btn.dataset.idx), 1);
      pubRenderTags();
    });
  });
}

// ── Zamanlama Toggle ──────────────────────────────────────────
document.getElementById("pub-schedule-check").addEventListener("change", function() {
  document.getElementById("pub-schedule-fields").style.display = this.checked ? "" : "none";
  document.getElementById("pub-btn-txt").textContent = this.checked ? "Zamanla" : "Paylaş";
});

// ── Paylaş Butonu ─────────────────────────────────────────────
document.getElementById("btn-publish").addEventListener("click", doPublish);

async function doPublish() {
  const isAlbum = pubMediaType === "album";
  const isScheduled = document.getElementById("pub-schedule-check").checked;
  const resEl = document.getElementById("pub-result");
  const txt = document.getElementById("pub-btn-txt");
  const spin = document.getElementById("pub-btn-spin");

  // Validasyon
  if (isAlbum && pubAlbumPaths.length < 2) {
    resEl.innerHTML = msgEl("err", "Albüm için en az 2 dosya seçin."); return;
  }
  if (!isAlbum && !pubFilePath) {
    resEl.innerHTML = msgEl("err", "Lütfen bir dosya yükleyin."); return;
  }
  if (isScheduled) {
    const dt = document.getElementById("pub-schedule-dt").value;
    if (!dt) { resEl.innerHTML = msgEl("err", "Lütfen tarih ve saat seçin."); return; }
    if (new Date(dt) <= new Date()) { resEl.innerHTML = msgEl("err", "Gelecekte bir tarih seçin."); return; }
  }

  txt.classList.add("hidden"); spin.classList.remove("hidden");
  resEl.innerHTML = "";

  const payload = {
    file_path: pubFilePath || "",
    media_type: pubMediaType,
    caption: document.getElementById("pub-caption").value,
    location_pk: pubLocationPk || "",
    usertags: pubTags,
    album_paths: pubAlbumPaths,
  };

  try {
    if (isScheduled) {
      payload.scheduled_at = new Date(document.getElementById("pub-schedule-dt").value).toISOString();
      await api("POST", "/publish/schedule", payload);
      resEl.innerHTML = msgEl("ok", `✓ Zamanlandı → ${new Date(payload.scheduled_at).toLocaleString("tr-TR")}`);
      toast("Zamanlandı", "ok");
    } else {
      await api("POST", "/publish/now", payload);
      resEl.innerHTML = msgEl("ok", "✓ Başarıyla paylaşıldı!");
      toast("Paylaşıldı", "ok");
      pubResetForm();
    }
    loadPublishQueue();
  } catch (e) {
    resEl.innerHTML = msgEl("err", e.message);
  } finally {
    txt.classList.remove("hidden"); spin.classList.add("hidden");
  }
}

function pubResetForm() {
  pubFilePath = null; pubAlbumPaths = []; pubLocationPk = null; pubLocationName = null; pubTags = [];
  document.getElementById("pub-file-preview").style.display = "none";
  document.getElementById("pub-file-preview").innerHTML = "";
  document.getElementById("pub-album-preview").innerHTML = "";
  document.getElementById("pub-caption").value = "";
  document.getElementById("pub-caption-count").textContent = "0 / 2200";
  document.getElementById("pub-loc-results").innerHTML = "";
  document.getElementById("pub-loc-selected").style.display = "none";
  document.getElementById("pub-tags-list").innerHTML = "";
  document.getElementById("pub-result").innerHTML = "";
  document.getElementById("pub-schedule-check").checked = false;
  document.getElementById("pub-schedule-fields").style.display = "none";
  document.getElementById("pub-btn-txt").textContent = "Paylaş";
  document.getElementById("pub-file-input").value = "";
  document.getElementById("pub-album-input").value = "";
}

// ── Kuyruk ────────────────────────────────────────────────────
document.getElementById("btn-pub-queue-refresh").addEventListener("click", loadPublishQueue);

const PUB_TYPE_ICONS = {
  photo: "📷", video: "🎬", reel: "🎞", album: "📚",
  story_photo: "📸", story_video: "🎥"
};
const PUB_TYPE_LABELS = {
  photo: "Fotoğraf", video: "Video", reel: "Reel", album: "Albüm",
  story_photo: "Story Foto", story_video: "Story Video"
};
const PUB_STATUS_LABELS = {
  scheduled: "Zamanlandı", done: "Paylaşıldı", error: "Hata", publishing: "Paylaşılıyor..."
};

async function loadPublishQueue() {
  const el = document.getElementById("pub-queue-list");
  try {
    const d = await api("GET", "/publish/queue");
    if (!d.items.length) {
      el.innerHTML = `<div style="text-align:center;padding:28px 0;color:var(--muted);font-size:13px">Henüz paylaşım yok.</div>`;
      return;
    }
    el.innerHTML = d.items.slice().reverse().map(item => {
      const icon = PUB_TYPE_ICONS[item.media_type] || "📄";
      const typeLabel = PUB_TYPE_LABELS[item.media_type] || item.media_type;
      const statusLabel = PUB_STATUS_LABELS[item.status] || item.status;
      const statusClass = item.status;
      const timeStr = item.scheduled_at
        ? new Date(item.scheduled_at).toLocaleString("tr-TR", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })
        : new Date(item.created_at).toLocaleString("tr-TR", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
      return `
        <div class="pub-queue-item">
          <div class="pub-queue-icon">${icon}</div>
          <div class="pub-queue-info">
            <div class="pub-queue-type">${typeLabel}</div>
            <div class="pub-queue-caption">${item.caption || item.file_name || "—"}</div>
            <div class="pub-queue-time">${item.scheduled_at ? "⏰ " : ""}${timeStr}</div>
            <span class="pub-queue-status ${statusClass}">${statusLabel}</span>
            ${item.error ? `<div style="font-size:11px;color:var(--red);margin-top:3px">${item.error}</div>` : ""}
          </div>
          ${item.status === "scheduled" || item.status === "error"
            ? `<button class="btn-danger sm pub-queue-del" data-id="${item.id}" style="flex-shrink:0;align-self:center">Sil</button>`
            : ""}
        </div>`;
    }).join("");

    el.querySelectorAll(".pub-queue-del").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true; btn.textContent = "...";
        try {
          await api("DELETE", `/publish/queue/${btn.dataset.id}`);
          loadPublishQueue();
          toast("Silindi");
        } catch (e) { toast(e.message, "err"); btn.disabled = false; btn.textContent = "Sil"; }
      });
    });
  } catch (e) {
    el.innerHTML = msgEl("err", e.message);
  }
}
