from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from instagrapi import Client
from instagrapi.exceptions import ChallengeRequired, SelectContactPointRecoveryForm, RecaptchaChallengeForm, BadPassword, LoginRequired, ChallengeUnknownStep
import os, urllib.request

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Web arayüzü static dosyaları — root'tan serve et
_web_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web"))

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(_web_dir, "index.html"))

@app.get("/style.css")
def serve_css():
    return FileResponse(os.path.join(_web_dir, "style.css"))

@app.get("/app.js")
def serve_js():
    return FileResponse(os.path.join(_web_dir, "app.js"))

cl = Client()
SESSION_FILE = "session.json"

# Pending challenge state
_pending_challenge: dict = {}

def _new_client():
    """Temiz bir Client instance'ı döndürür."""
    c = Client()
    c.delay_range = [1, 3]
    return c

if os.path.exists(SESSION_FILE):
    try:
        cl.load_settings(SESSION_FILE)
        cl.delay_range = [1, 3]
        cl.get_timeline_feed()
    except Exception:
        # Session geçersiz — temizle
        try:
            os.remove(SESSION_FILE)
        except Exception:
            pass
        cl = _new_client()
else:
    cl.delay_range = [1, 3]

# ── Modeller ──
class LoginData(BaseModel):
    username: str
    password: str

class MediaUrl(BaseModel):
    url: str

class UsernameBody(BaseModel):
    username: str

class DMBody(BaseModel):
    username: str
    text: str

class EditProfileBody(BaseModel):
    full_name: str = ""
    biography: str = ""

class CommentBody(BaseModel):
    media_id: str
    text: str

class FollowBody(BaseModel):

    username: str

class HashtagBody(BaseModel):
    tag: str
    amount: int = 12

class ChallengeCodeBody(BaseModel):
    code: str

# ── Auth ──
@app.post("/login")
def login(data: LoginData):
    global cl, _pending_challenge
    _pending_challenge = {}
    # Her login denemesinde temiz client
    cl = _new_client()
    try:
        cl.login(data.username, data.password)
        cl.dump_settings(SESSION_FILE)
        acc = cl.account_info()
        u = cl.user_info_by_username(acc.username)
        return {
            "status": "ok",
            "username": u.username,
            "full_name": u.full_name,
            "followers": u.follower_count,
            "following": u.following_count,
            "profile_pic": str(u.profile_pic_url)
        }
    except ChallengeRequired:
        _handle_challenge(data.username)
        raise HTTPException(409, "challenge_required")
    except ChallengeUnknownStep:
        # Yeni bloks challenge akışı — doğrudan kod bekliyoruz
        _pending_challenge = {"waiting": True, "username": data.username, "bloks": True}
        raise HTTPException(409, "challenge_required")
    except BadPassword:
        raise HTTPException(401, "Şifre hatalı veya IP adresi Instagram tarafından engellendi. VPN kullanmayı deneyin.")
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(401, str(e))

def _handle_challenge(username: str):
    """ChallengeRequired sonrası kod gönderme akışını başlatır."""
    global _pending_challenge
    try:
        cl.challenge_resolve(cl.last_json)
    except ChallengeUnknownStep:
        # Bloks akışı — challenge_context ile devam
        _pending_challenge = {"waiting": True, "username": username, "bloks": True}
        return
    except Exception:
        pass
    try:
        cl.challenge_send_code(1)
    except Exception:
        pass
    _pending_challenge = {"waiting": True, "username": username}

@app.post("/challenge/submit")
def challenge_submit(data: ChallengeCodeBody):
    if not _pending_challenge.get("waiting"):
        raise HTTPException(400, "Bekleyen challenge yok")
    try:
        if _pending_challenge.get("bloks"):
            # Yeni bloks akışı: challenge_context ile security_code gönder
            last = cl.last_json
            challenge_context = last.get("challenge_context", "")
            cl._send_private_request(
                "challenge/",
                {
                    "security_code": data.code,
                    "challenge_context": challenge_context,
                    "_uuid": cl.uuid,
                    "_uid": cl.user_id,
                    "_csrftoken": cl.token,
                }
            )
        else:
            cl.challenge_resolve_simple(data.code)
        cl.dump_settings(SESSION_FILE)
        _pending_challenge.clear()
        acc = cl.account_info()
        u = cl.user_info_by_username(acc.username)
        return {
            "status": "ok",
            "username": u.username,
            "full_name": u.full_name,
            "followers": u.follower_count,
            "following": u.following_count,
            "profile_pic": str(u.profile_pic_url)
        }
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(400, str(e))

@app.get("/challenge/status")
def challenge_status():
    return {"waiting": _pending_challenge.get("waiting", False)}

@app.post("/logout")
def logout():
    try:
        cl.logout()
        if os.path.exists(SESSION_FILE): os.remove(SESSION_FILE)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/me")
def me():
    try:
        acc = cl.account_info()
        u = cl.user_info_by_username(acc.username)
        return {"username": u.username, "full_name": u.full_name,
                "followers": u.follower_count, "following": u.following_count,
                "profile_pic": str(u.profile_pic_url)}
    except Exception as e:
        # Session geçersizse dosyayı temizle
        if os.path.exists(SESSION_FILE):
            try: os.remove(SESSION_FILE)
            except Exception: pass
        raise HTTPException(401, str(e))

# ── Profil ──
@app.get("/profile/{username}")
def profile(username: str):
    try:
        u = cl.user_info_by_username(username)
        return {"username": u.username, "full_name": u.full_name, "bio": u.biography,
                "followers": u.follower_count, "following": u.following_count,
                "posts": u.media_count, "profile_pic": str(u.profile_pic_url),
                "is_private": u.is_private}
    except Exception as e:
        raise HTTPException(404, str(e))

@app.post("/profile/edit")
def edit_profile(data: EditProfileBody):
    try:
        cl.account_edit(full_name=data.full_name, biography=data.biography)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

# ── Takip ──
@app.post("/follow")
def follow(data: FollowBody):
    try:
        uid = cl.user_id_from_username(data.username)
        cl.user_follow(uid)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/unfollow")
def unfollow(data: FollowBody):
    try:
        uid = cl.user_id_from_username(data.username)
        cl.user_unfollow(uid)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/block")
def block(data: FollowBody):
    try:
        uid = cl.user_id_from_username(data.username)
        cl.user_block(uid)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/followers/{username}")
def followers(username: str, amount: int = 10):
    try:
        uid = cl.user_id_from_username(username)
        users = cl.user_followers(uid, amount=amount, use_cache=True)
        return {"items": [{"username": u.username, "full_name": u.full_name,
                           "pic": str(u.profile_pic_url), "uid": str(u.pk)} for u in users.values()]}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/following/{username}")
def following(username: str, amount: int = 10):
    try:
        uid = cl.user_id_from_username(username)
        users = cl.user_following(uid, amount=amount, use_cache=True)
        return {"items": [{"username": u.username, "full_name": u.full_name,
                           "pic": str(u.profile_pic_url), "uid": str(u.pk)} for u in users.values()]}
    except Exception as e:
        raise HTTPException(400, str(e))

class PageBody(BaseModel):
    username: str
    cursor: str = ""
    max_id: str = ""
    amount: int = 12

@app.post("/followers/page")
def followers_page(data: PageBody):
    """Sayfalı takipçi çekme (private API, max_id ile)."""
    try:
        uid = cl.user_id_from_username(data.username)
        import time; time.sleep(1)
        users, next_max_id = cl.user_followers_v1_chunk(
            str(uid), max_amount=data.amount, max_id=data.max_id or ""
        )
        return {
            "items": [{"username": u.username, "full_name": u.full_name,
                       "pic": str(u.profile_pic_url), "uid": str(u.pk)} for u in users],
            "next_max_id": next_max_id or "",
            "has_more": bool(next_max_id)
        }
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/following/page")
def following_page(data: PageBody):
    """Sayfalı takip çekme."""
    try:
        uid = cl.user_id_from_username(data.username)
        import time; time.sleep(1)
        users, next_max_id = cl.user_following_v1_chunk(
            str(uid), max_amount=data.amount, max_id=data.max_id
        )
        return {
            "items": [{"username": u.username, "full_name": u.full_name,
                       "pic": str(u.profile_pic_url), "uid": str(u.pk)} for u in users],
            "next_max_id": next_max_id or "",
            "has_more": bool(next_max_id)
        }
    except Exception as e:
        raise HTTPException(400, str(e))

class RemoveFollowerBody(BaseModel):
    username: str

@app.post("/remove-follower")
def remove_follower(data: RemoveFollowerBody):
    """Takipçiyi çıkar (kendi hesabından birini kaldır)."""
    try:
        uid = cl.user_id_from_username(data.username)
        cl.user_remove_follower(uid)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/friendship/{username}")
def friendship(username: str):
    """Kullanıcının bizi takip edip etmediğini kontrol et."""
    try:
        uid = cl.user_id_from_username(username)
        status = cl.user_friendship(uid)
        return {
            "followed_by": status.followed_by,   # bizi takip ediyor mu
            "following": status.following,         # biz takip ediyor muyuz
            "blocking": status.blocking,
            "is_private": status.is_private,
        }
    except Exception as e:
        raise HTTPException(400, str(e))

# ── İndirme ──
def dl_dir(*sub):
    path = os.path.join(os.path.expanduser("~/Downloads/instagram"), *sub)
    os.makedirs(path, exist_ok=True)
    return path

@app.post("/media/info")
def media_info_endpoint(data: MediaUrl):
    try:
        pk = cl.media_pk_from_url(data.url)
        m = cl.media_info(pk)
        TYPE = {1: "photo", 2: "video", 8: "album"}
        resources = []
        if m.media_type == 8 and m.resources:
            for r in m.resources:
                resources.append({
                    "type": TYPE.get(r.media_type, "photo"),
                    "thumbnail": str(r.thumbnail_url) if r.thumbnail_url else None,
                    "video_url": str(r.video_url) if r.video_url else None,
                })
        return {
            "pk": str(m.pk),
            "code": m.code,
            "type": TYPE.get(m.media_type, "photo"),
            "media_type": m.media_type,
            "thumbnail": str(m.thumbnail_url) if m.thumbnail_url else None,
            "video_url": str(m.video_url) if m.video_url else None,
            "caption": m.caption_text or "",
            "likes": m.like_count or 0,
            "comments": m.comment_count or 0,
            "username": m.user.username if m.user else "",
            "user_pic": str(m.user.profile_pic_url) if m.user else "",
            "taken_at": m.taken_at.isoformat() if m.taken_at else "",
            "resources": resources,
            "resource_count": len(resources) if resources else 1,
        }
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/download/post")
def download_post(data: MediaUrl):
    try:
        pk = cl.media_pk_from_url(data.url)
        m = cl.media_info(pk)
        d = dl_dir()
        if m.media_type == 1:
            path = cl.photo_download(pk, folder=d)
            return {"status": "ok", "file": str(path), "type": "photo",
                    "thumbnail": str(m.thumbnail_url) if m.thumbnail_url else None}
        elif m.media_type == 2:
            path = cl.video_download(pk, folder=d)
            return {"status": "ok", "file": str(path), "type": "video",
                    "thumbnail": str(m.thumbnail_url) if m.thumbnail_url else None}
        elif m.media_type == 8:
            paths = cl.album_download(pk, folder=d)
            return {"status": "ok", "files": [str(p) for p in paths], "type": "album",
                    "thumbnail": str(m.thumbnail_url) if m.thumbnail_url else None}
        else:
            raise HTTPException(400, "Desteklenmeyen tür")
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/download/stories/{username}")
def download_stories(username: str):
    try:
        uid = cl.user_id_from_username(username)
        stories = cl.user_stories(uid)
        d = dl_dir("stories")
        files = []
        for s in stories:
            if s.media_type == 1:
                p = cl.photo_download_by_url(str(s.thumbnail_url), folder=d)
            else:
                p = cl.video_download_by_url(str(s.video_url), folder=d)
            files.append(str(p))
        return {"status": "ok", "count": len(files), "files": files}
    except Exception as e:
        raise HTTPException(400, str(e))

# ── Kayıtlılar ──
@app.get("/saved")
def saved(amount: int = 50):
    try:
        items = cl.collection_medias("saved", amount=amount)
        return {"status": "ok", "total": len(items), "items": [
            {"pk": str(m.pk), "type": m.media_type,
             "thumbnail": str(m.thumbnail_url) if m.thumbnail_url else None,
             "url": f"https://www.instagram.com/p/{m.code}/"} for m in items]}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/saved/collections")
def saved_collections():
    """Kullanıcının tüm koleksiyonlarını listeler."""
    try:
        cols = cl.collections()
        return {"items": [
            {"pk": str(c.id), "name": c.name,
             "cover": str(c.cover_media.thumbnail_url) if c.cover_media and c.cover_media.thumbnail_url else None,
             "count": c.media_count} for c in cols]}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/saved/collection/{collection_pk}")
def saved_collection_medias(collection_pk: str, amount: int = 50):
    """Belirli bir koleksiyonun medyalarını döndürür."""
    try:
        items = cl.collection_medias(collection_pk, amount=amount)
        return {"status": "ok", "total": len(items), "items": [
            {"pk": str(m.pk), "type": m.media_type,
             "thumbnail": str(m.thumbnail_url) if m.thumbnail_url else None,
             "url": f"https://www.instagram.com/p/{m.code}/"} for m in items]}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/unsave")
def unsave(data: MediaUrl):
    try:
        pk = cl.media_pk_from_url(data.url)
        cl.media_unsave(pk)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/download/saved")
def download_saved(data: MediaUrl):
    try:
        pk = cl.media_pk_from_url(data.url)
        m = cl.media_info(pk)
        d = dl_dir("saved")
        if m.media_type == 1:   path = cl.photo_download(pk, folder=d)
        elif m.media_type == 2: path = cl.video_download(pk, folder=d)
        elif m.media_type == 8:
            paths = cl.album_download(pk, folder=d)
            return {"status": "ok", "files": [str(p) for p in paths]}
        else: raise HTTPException(400, "Desteklenmeyen tür")
        return {"status": "ok", "file": str(path)}
    except Exception as e:
        raise HTTPException(400, str(e))

# ── Beğeni / Yorum ──
@app.post("/like")
def like(data: MediaUrl):
    try:
        pk = cl.media_pk_from_url(data.url)
        cl.media_like(pk)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/unlike")
def unlike(data: MediaUrl):
    try:
        pk = cl.media_pk_from_url(data.url)
        cl.media_unlike(pk)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/comment")
def comment(data: CommentBody):
    try:
        cl.media_comment(data.media_id, data.text)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/comments/{media_id}")
def get_comments(media_id: str):
    try:
        comments = cl.media_comments(media_id, amount=20)
        return {"items": [{"user": c.user.username, "text": c.text,
                           "pk": str(c.pk)} for c in comments]}
    except Exception as e:
        raise HTTPException(400, str(e))

# ── DM ──
@app.get("/inbox")
def inbox():
    try:
        threads = cl.direct_threads(amount=20)
        result = []
        for t in threads:
            last = t.messages[0].text if t.messages and hasattr(t.messages[0], "text") else ""
            users = [u.username for u in t.users]
            result.append({"thread_id": str(t.id), "users": users, "last_message": last or "📎 Medya"})
        return {"items": result}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/dm/send")
def send_dm(data: DMBody):
    try:
        uid = cl.user_id_from_username(data.username)
        cl.direct_send(data.text, [uid])
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

# ── Keşfet / Arama ──
@app.get("/search/users/{query}")
def search_users(query: str):
    try:
        users = cl.search_users(query)
        return {"items": [{"username": u.username, "full_name": u.full_name,
                           "pic": str(u.profile_pic_url)} for u in users[:10]]}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/search/hashtag")
def search_hashtag(data: HashtagBody):
    try:
        medias = cl.hashtag_medias_recent(data.tag, amount=data.amount)
        return {"items": [{"pk": str(m.pk), "url": f"https://www.instagram.com/p/{m.code}/",
                           "thumbnail": str(m.thumbnail_url) if m.thumbnail_url else None,
                           "likes": m.like_count} for m in medias]}
    except Exception as e:
        raise HTTPException(400, str(e))

# ── Konum Arama ──
@app.get("/search/location/{name}")
def search_location(name: str):
    try:
        locations = cl.location_search(name)
        return {"items": [{"pk": str(l.pk), "name": l.name,
                           "lat": l.lat, "lng": l.lng} for l in locations[:10]]}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/location/medias/{location_pk}")
def location_medias(location_pk: str):
    try:
        medias = cl.location_medias_recent(location_pk, amount=12)
        return {"items": [{"pk": str(m.pk), "url": f"https://www.instagram.com/p/{m.code}/",
                           "thumbnail": str(m.thumbnail_url) if m.thumbnail_url else None,
                           "likes": m.like_count} for m in medias]}
    except Exception as e:
        raise HTTPException(400, str(e))

# ── Zamanlayıcı ──
import threading, json as _json

SCHEDULER_FILE = "scheduler.json"
scheduler_threads = {}

def load_schedulers():
    if os.path.exists(SCHEDULER_FILE):
        with open(SCHEDULER_FILE) as f:
            return _json.load(f)
    return []

def save_schedulers(items):
    with open(SCHEDULER_FILE, "w") as f:
        _json.dump(items, f)

def run_scheduler(item):
    import time
    while True:
        interval = item.get("interval_minutes", 60) * 60
        time.sleep(interval)
        try:
            uid = cl.user_id_from_username(item["username"])
            stories = cl.user_stories(uid)
            d = dl_dir("scheduled", item["username"])
            for s in stories:
                if s.media_type == 1:
                    cl.photo_download_by_url(str(s.thumbnail_url), folder=d)
                else:
                    cl.video_download_by_url(str(s.video_url), folder=d)
        except Exception:
            pass

@app.get("/schedulers")
def get_schedulers():
    return {"items": load_schedulers()}

class SchedulerBody(BaseModel):
    username: str
    interval_minutes: int = 60

@app.post("/schedulers")
def add_scheduler(data: SchedulerBody):
    items = load_schedulers()
    item = {"username": data.username, "interval_minutes": data.interval_minutes}
    if any(i["username"] == data.username for i in items):
        raise HTTPException(400, "Bu kullanıcı zaten ekli")
    items.append(item)
    save_schedulers(items)
    t = threading.Thread(target=run_scheduler, args=(item,), daemon=True)
    t.start()
    scheduler_threads[data.username] = t
    return {"status": "ok"}

@app.delete("/schedulers/{username}")
def remove_scheduler(username: str):
    items = load_schedulers()
    items = [i for i in items if i["username"] != username]
    save_schedulers(items)
    return {"status": "ok"}

# Başlangıçta kayıtlı zamanlayıcıları başlat
for _item in load_schedulers():
    _t = threading.Thread(target=run_scheduler, args=(_item,), daemon=True)
    _t.start()
    scheduler_threads[_item["username"]] = _t

# ── İndirilenler ──
@app.get("/downloads/list")
def downloads_list():
    base = os.path.expanduser("~/Downloads/instagram")
    IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
    VIDEO_EXT = {".mp4", ".mov", ".webm"}
    items = []
    if not os.path.exists(base):
        return {"items": []}
    for root, dirs, files in os.walk(base):
        dirs.sort()
        for fname in sorted(files, reverse=True):
            if fname.startswith("."):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext not in IMAGE_EXT and ext not in VIDEO_EXT:
                continue
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, base)
            stat = os.stat(full)
            # Dosya adından media_pk çıkar: {username}_{pk}.ext
            instagram_url = None
            stem = os.path.splitext(fname)[0]
            parts = stem.rsplit("_", 1)
            if len(parts) == 2 and parts[1].isdigit():
                try:
                    code = cl.media_code_from_pk(int(parts[1]))
                    instagram_url = f"https://www.instagram.com/p/{code}/"
                except Exception:
                    pass
            items.append({
                "name": fname,
                "path": full,
                "rel": rel,
                "size": stat.st_size,
                "mtime": stat.st_mtime,
                "type": "video" if ext in VIDEO_EXT else "image",
                "url": f"/downloads/file/{rel.replace(os.sep, '/')}",
                "instagram_url": instagram_url,
            })
    items.sort(key=lambda x: x["mtime"], reverse=True)
    return {"items": items}

@app.get("/downloads/file/{path:path}")
def downloads_file(path: str):
    from fastapi.responses import FileResponse
    base = os.path.expanduser("~/Downloads/instagram")
    full = os.path.normpath(os.path.join(base, path))
    if not full.startswith(base):
        raise HTTPException(403, "Erişim reddedildi")
    if not os.path.isfile(full):
        raise HTTPException(404, "Dosya bulunamadı")
    return FileResponse(full)

@app.get("/downloads/open-folder")
def open_folder(path: str = ""):
    """Finder'da klasörü aç."""
    import subprocess
    base = os.path.expanduser("~/Downloads/instagram")
    if path:
        target = os.path.normpath(os.path.join(base, path))
        if not target.startswith(base):
            raise HTTPException(403, "Erişim reddedildi")
        # Dosyaysa klasörünü aç, klasörse direkt aç
        if os.path.isfile(target):
            subprocess.Popen(["open", "-R", target])
        else:
            subprocess.Popen(["open", target if os.path.isdir(target) else base])
    else:
        os.makedirs(base, exist_ok=True)
        subprocess.Popen(["open", base])
    return {"status": "ok"}

@app.get("/downloads/check")
def downloads_check(instagram_url: str):
    """Verilen Instagram URL'si daha önce indirilmiş mi kontrol et."""
    base = os.path.expanduser("~/Downloads/instagram")
    if not os.path.exists(base):
        return {"downloaded": False}
    try:
        pk = cl.media_pk_from_url(instagram_url)
        pk_str = str(pk)
        for root, dirs, files in os.walk(base):
            for fname in files:
                stem = os.path.splitext(fname)[0]
                parts = stem.rsplit("_", 1)
                if len(parts) == 2 and parts[1] == pk_str:
                    return {"downloaded": True, "file": fname}
        return {"downloaded": False}
    except Exception:
        return {"downloaded": False}

@app.delete("/downloads/file/{path:path}")
def downloads_delete(path: str):
    base = os.path.expanduser("~/Downloads/instagram")
    full = os.path.normpath(os.path.join(base, path))
    if not full.startswith(base):
        raise HTTPException(403, "Erişim reddedildi")
    if not os.path.isfile(full):
        raise HTTPException(404, "Dosya bulunamadı")
    os.remove(full)
    return {"status": "ok"}

@app.get("/notifications")
def notifications():
    try:
        notifs = cl.news_inbox_v1()
        items = []
        for n in notifs.get("new", [])[:20]:
            items.append({"type": n.get("type", ""), "text": n.get("text", ""),
                          "user": n.get("user", {}).get("username", "")})
        return {"items": items}
    except Exception as e:
        raise HTTPException(400, str(e))

# ── Paylaş ──────────────────────────────────────────────────────────────────

PUBLISH_FILE = "publish_queue.json"
_publish_lock = threading.Lock()

def load_publish_queue():
    if os.path.exists(PUBLISH_FILE):
        with open(PUBLISH_FILE) as f:
            return _json.load(f)
    return []

def save_publish_queue(items):
    with open(PUBLISH_FILE, "w") as f:
        _json.dump(items, f, ensure_ascii=False)

def _upload_dir():
    path = os.path.join(os.path.dirname(__file__), "uploads")
    os.makedirs(path, exist_ok=True)
    return path

def _do_publish(item: dict):
    """Tek bir paylaşım görevini gerçekleştirir."""
    import time as _time
    from pathlib import Path as _Path
    path = item["file_path"]
    media_type = item["media_type"]   # photo | video | reel | story_photo | story_video | album
    caption = item.get("caption", "")
    location_pk = item.get("location_pk")
    usertags_raw = item.get("usertags", [])  # [{"username": ..., "x": ..., "y": ...}]

    location = None
    if location_pk:
        try:
            locs = cl.location_search(location_pk)
            if locs:
                location = locs[0]
        except Exception:
            pass

    usertags = []
    for ut in usertags_raw:
        try:
            from instagrapi.types import Usertag, StoryMention
            uid = cl.user_id_from_username(ut["username"])
            u = cl.user_info(uid)
            usertags.append(Usertag(user=u, x=float(ut.get("x", 0.5)), y=float(ut.get("y", 0.5))))
        except Exception:
            pass

    if media_type == "photo":
        cl.photo_upload(_Path(path), caption=caption, location=location, usertags=usertags)
    elif media_type == "video":
        cl.video_upload(_Path(path), caption=caption, location=location, usertags=usertags)
    elif media_type == "reel":
        cl.clip_upload(_Path(path), caption=caption)
    elif media_type == "story_photo":
        cl.photo_upload_to_story(_Path(path))
    elif media_type == "story_video":
        cl.video_upload_to_story(_Path(path))
    elif media_type == "album":
        paths = item.get("album_paths", [path])
        cl.album_upload([_Path(p) for p in paths], caption=caption, location=location)

def _publish_worker():
    """Arka planda zamanlı paylaşımları kontrol eder."""
    import time as _time
    from datetime import datetime as _dt
    while True:
        _time.sleep(30)
        try:
            with _publish_lock:
                queue = load_publish_queue()
                updated = []
                for item in queue:
                    if item.get("status") != "scheduled":
                        updated.append(item)
                        continue
                    scheduled_at = item.get("scheduled_at")
                    if not scheduled_at:
                        updated.append(item)
                        continue
                    try:
                        sched_dt = _dt.fromisoformat(scheduled_at)
                        if _dt.now() >= sched_dt:
                            item["status"] = "publishing"
                            save_publish_queue(updated + [item] + queue[len(updated)+1:])
                            try:
                                _do_publish(item)
                                item["status"] = "done"
                            except Exception as e:
                                item["status"] = "error"
                                item["error"] = str(e)
                    except Exception:
                        pass
                    updated.append(item)
                save_publish_queue(updated)
        except Exception:
            pass

# Zamanlı paylaşım worker'ını başlat
_pw = threading.Thread(target=_publish_worker, daemon=True)
_pw.start()

@app.post("/publish/upload")
async def publish_upload(file: UploadFile = File(...)):
    """Dosyayı sunucuya yükler, geçici path döndürür."""
    import shutil, uuid
    ext = os.path.splitext(file.filename)[1].lower()
    fname = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(_upload_dir(), fname)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"path": dest, "name": file.filename, "size": os.path.getsize(dest)}

@app.post("/publish/upload-album")
async def publish_upload_album(files: list[UploadFile] = File(...)):
    """Albüm için birden fazla dosya yükler."""
    import shutil, uuid
    results = []
    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        fname = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(_upload_dir(), fname)
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
        results.append({"path": dest, "name": file.filename})
    return {"files": results}

class PublishNowBody(BaseModel):
    file_path: str
    media_type: str          # photo | video | reel | story_photo | story_video | album
    caption: str = ""
    location_pk: str = ""
    usertags: list = []
    album_paths: list = []

@app.post("/publish/now")
def publish_now(data: PublishNowBody):
    """Hemen paylaş."""
    try:
        _do_publish(data.dict())
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

class PublishScheduleBody(BaseModel):
    file_path: str
    media_type: str
    caption: str = ""
    location_pk: str = ""
    usertags: list = []
    album_paths: list = []
    scheduled_at: str        # ISO format: 2025-03-27T15:30:00

@app.post("/publish/schedule")
def publish_schedule(data: PublishScheduleBody):
    """Zamanlı paylaşım kuyruğuna ekle."""
    import uuid
    with _publish_lock:
        queue = load_publish_queue()
        item = data.dict()
        item["id"] = uuid.uuid4().hex
        item["status"] = "scheduled"
        item["created_at"] = __import__("datetime").datetime.now().isoformat()
        queue.append(item)
        save_publish_queue(queue)
    return {"status": "ok", "id": item["id"]}

@app.get("/publish/queue")
def publish_queue():
    """Tüm paylaşım kuyruğunu döndürür."""
    with _publish_lock:
        queue = load_publish_queue()
    # Dosya yollarını gizle, sadece adı göster
    result = []
    for item in queue:
        result.append({
            "id": item.get("id", ""),
            "media_type": item.get("media_type", ""),
            "caption": item.get("caption", ""),
            "status": item.get("status", ""),
            "scheduled_at": item.get("scheduled_at", ""),
            "created_at": item.get("created_at", ""),
            "error": item.get("error", ""),
            "file_name": os.path.basename(item.get("file_path", "")),
        })
    return {"items": result}

@app.delete("/publish/queue/{item_id}")
def publish_queue_delete(item_id: str):
    """Kuyruktan sil."""
    with _publish_lock:
        queue = load_publish_queue()
        queue = [i for i in queue if i.get("id") != item_id]
        save_publish_queue(queue)
    return {"status": "ok"}

# ── Image Proxy ──
@app.get("/proxy/image")
def proxy_image(url: str):
    """Instagram CDN resimlerini backend üzerinden serve eder (CORS bypass)."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.instagram.com/"
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            ct = resp.headers.get("Content-Type", "image/jpeg")
        return Response(content=data, media_type=ct, headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*"
        })
    except Exception as e:
        raise HTTPException(400, str(e))
