#!/usr/bin/env python3
"""Peluncur Office-Desktop: menjalankan WS server + web server statis sekaligus.

    python run.py            # data proses desktop asli
    python run.py --demo     # mode demo (karyawan simulasi)
    python run.py --no-browser

Buka http://localhost:8000 (browser dibuka otomatis jika memungkinkan).
"""

import argparse
import http.server
import os
import socketserver
import subprocess
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")
HTTP_PORT = 8000


def start_http():
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=WEB_DIR, **kw)

        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", HTTP_PORT), Handler) as httpd:
        print(f"[http] kantor 3D siap di http://localhost:{HTTP_PORT}")
        httpd.serve_forever()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    t = threading.Thread(target=start_http, daemon=True)
    t.start()

    url = f"http://localhost:{HTTP_PORT}"
    if not args.no_browser and os.environ.get("DISPLAY"):
        try:
            webbrowser.open(url)
        except Exception:
            pass
    elif not args.no_browser and sys.platform == "win32":
        try:
            webbrowser.open(url)
        except Exception:
            pass

    cmd = [sys.executable, os.path.join(ROOT, "backend", "server.py")]
    if args.demo:
        cmd.append("--demo")
    print("[ws] memulai server data karyawan… (Ctrl+C untuk berhenti)")
    try:
        proc = subprocess.Popen(cmd, cwd=os.path.join(ROOT, "backend"))
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        print("\nsampai jumpa di kantor 👋")


if __name__ == "__main__":
    main()
