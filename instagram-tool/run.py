#!/usr/bin/env python3
"""
Instagram Tool - Başlatıcı
- instagrapi/.venv içindeki Python'u kullanır, yoksa oluşturur
- Gerekli paketleri kurar (yoksa)
- Boşta olan bir port bulur
- FastAPI sunucusunu başlatır
- Tarayıcıda web arayüzünü açar
"""

import subprocess
import sys
import socket
import time
import webbrowser
import os
import re

# Dizin yapısı:
#   instagrapi/               ← ROOT (ana proje)
#   instagrapi/.venv/         ← sanal ortam
#   instagrapi/instagram-tool/← bu dosyanın bulunduğu yer
#       backend/
#       web/
#       extension/

TOOL_DIR        = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR        = os.path.dirname(TOOL_DIR)               # instagrapi/
VENV_DIR        = os.path.join(ROOT_DIR, ".venv")
REQUIREMENTS    = os.path.join(TOOL_DIR, "backend", "requirements.txt")
BACKEND_DIR     = os.path.join(TOOL_DIR, "backend")
APP_JS          = os.path.join(TOOL_DIR, "web", "app.js")

# venv içindeki python/uvicorn yolları
if sys.platform == "win32":
    VENV_PYTHON  = os.path.join(VENV_DIR, "Scripts", "python.exe")
    VENV_UVICORN = os.path.join(VENV_DIR, "Scripts", "uvicorn.exe")
else:
    VENV_PYTHON  = os.path.join(VENV_DIR, "bin", "python")
    VENV_UVICORN = os.path.join(VENV_DIR, "bin", "uvicorn")


def find_free_port(start=8000, end=9000):
    """Boşta olan ilk portu döndürür."""
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("", port))
                return port
            except OSError:
                continue
    raise RuntimeError("Boşta port bulunamadı.")


def ensure_venv():
    """venv yoksa oluşturur."""
    if not os.path.isfile(VENV_PYTHON):
        print(f"� Sanal ortam oluşturuluyor → {VENV_DIR}")
        subprocess.run([sys.executable, "-m", "venv", VENV_DIR], check=True)
        print("✅ Sanal ortam hazır.")
    else:
        print(f"✅ Sanal ortam mevcut → {VENV_DIR}")


def ensure_requirements():
    """requirements.txt'deki paketleri venv içine kurar."""
    print("📦 Gereksinimler kontrol ediliyor...")
    result = subprocess.run(
        [VENV_PYTHON, "-m", "pip", "install", "-r", REQUIREMENTS, "--quiet"],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print("⚠️  Paket kurulumunda hata:")
        print(result.stderr)
        sys.exit(1)
    print("✅ Gereksinimler hazır.")


def patch_app_js(port):
    """app.js ve extension dosyalarındaki API portunu günceller."""
    # web/app.js
    with open(APP_JS, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(
        r'const API\s*=\s*"http://localhost:\d+"',
        f'const API = "http://localhost:{port}"',
        content
    )
    updated = re.sub(
        r'`http://localhost:\d+(\$\{item\.url\})`',
        r'`${API}\1`',
        updated
    )
    with open(APP_JS, "w", encoding="utf-8") as f:
        f.write(updated)

    # extension/content.js
    content_js = os.path.join(TOOL_DIR, "extension", "content.js")
    with open(content_js, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(
        r'const API\s*=\s*"http://localhost:\d+"',
        f'const API = "http://localhost:{port}"',
        content
    )
    with open(content_js, "w", encoding="utf-8") as f:
        f.write(updated)

    # extension/popup.js
    popup_js = os.path.join(TOOL_DIR, "extension", "popup.js")
    with open(popup_js, "r", encoding="utf-8") as f:
        content = f.read()
    updated = re.sub(
        r'const API\s*=\s*"http://localhost:\d+"',
        f'const API = "http://localhost:{port}"',
        content
    )
    with open(popup_js, "w", encoding="utf-8") as f:
        f.write(updated)

    # extension/manifest.json — host_permissions artık localhost/* olduğu için güncelleme gerekmez


def main():
    print("=" * 50)
    print("  Instagram Tool")
    print("=" * 50)

    ensure_venv()
    ensure_requirements()

    port = find_free_port()
    print(f"🔌 Port seçildi: {port}")

    patch_app_js(port)

    url = f"http://localhost:{port}"
    print(f"🚀 Sunucu başlatılıyor → {url}")
    print("   Durdurmak için Ctrl+C\n")

    # Tarayıcıyı 2 saniye sonra aç
    import threading
    def open_browser():
        time.sleep(2)
        webbrowser.open(url)
    threading.Thread(target=open_browser, daemon=True).start()

    # uvicorn'u venv içindeki python ile başlat
    subprocess.run(
        [VENV_PYTHON, "-m", "uvicorn", "main:app",
         "--host", "0.0.0.0",
         "--port", str(port)],
        cwd=BACKEND_DIR
    )


if __name__ == "__main__":
    main()
