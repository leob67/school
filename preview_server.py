"""Local preview of the patched files: serves /workspace/dist and relays /api/* to the live site."""
import http.server
import urllib.error
import urllib.request
import os

ROOT = "/workspace/dist"
LIVE = "https://schoolfr.ayro.dev"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        pass

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        full = os.path.join(ROOT, clean.lstrip("/"))
        if os.path.isdir(full):
            full = os.path.join(full, "index.html")
        if not os.path.exists(full):
            full = os.path.join(ROOT, "index.html")
        return full

    def _relay(self):
        url = LIVE + self.path
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                body, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            body, status, ctype = e.read(), e.code, e.headers.get("Content-Type", "application/json")
        except Exception as e:  # noqa: BLE001
            body, status, ctype = str(e).encode(), 502, "text/plain"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._relay()
            return
        super().do_GET()

    def do_HEAD(self):
        if self.path.startswith("/api/"):
            self._relay()
            return
        super().do_HEAD()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", 8099), Handler).serve_forever()
