#!/usr/bin/env python3
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY_BYTES = 16 * 1024
DEFAULT_EXTRACT_TIMEOUT = 45
DEFAULT_PROBE_TIMEOUT = 20
ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtube-nocookie.com",
    "youtube-nocookie.com",
}


def is_allowed_youtube_url(value):
    try:
        parsed = urllib.parse.urlparse(value)
    except (TypeError, ValueError):
        return False
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    return host in ALLOWED_HOSTS


def classify_extractor_failure(stderr):
    text = (stderr or "").lower()
    bot_markers = (
        "sign in to confirm you're not a bot",
        "sign in to confirm you’re not a bot",
        "login_required",
        "bot challenge",
    )
    return "bot_challenge" if any(marker in text for marker in bot_markers) else "extract_error"


def select_probe_format(info):
    formats = info.get("formats") or []
    candidates = []
    for fmt in formats:
        url = fmt.get("url")
        protocol = str(fmt.get("protocol") or "")
        if not url or not url.startswith(("http://", "https://")):
            continue
        if protocol and not (protocol.startswith("http") or protocol in {"https", "http"}):
            continue

        has_audio = fmt.get("acodec") not in {None, "none"}
        has_video = fmt.get("vcodec") not in {None, "none"}
        height = fmt.get("height") or 0
        filesize = fmt.get("filesize") or fmt.get("filesize_approx") or 0
        preferred_height = height if height and height <= 480 else 10_000 + height
        candidates.append((
            0 if (has_audio and has_video) else 1,
            preferred_height,
            filesize,
            str(fmt.get("format_id") or ""),
            fmt,
        ))

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[:4])
    return candidates[0][4]


def build_ytdlp_command(url):
    return [
        os.environ.get("YTDLP_BIN", "/opt/venv/bin/yt-dlp"),
        "--no-playlist",
        "--skip-download",
        "--dump-single-json",
        "--no-warnings",
        "--socket-timeout",
        os.environ.get("YTDLP_SOCKET_TIMEOUT", "20"),
        "--js-runtimes",
        "node",
        "--impersonate",
        os.environ.get("YTDLP_IMPERSONATE", "chrome"),
        "--extractor-args",
        "youtube:player_client=mweb",
        "--extractor-args",
        "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416",
        url,
    ]


def extract_info(url):
    timeout = int(os.environ.get("YTDLP_EXTRACT_TIMEOUT", DEFAULT_EXTRACT_TIMEOUT))
    try:
        completed = subprocess.run(
            build_ytdlp_command(url),
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "status": "extract_timeout",
            "detail": f"yt-dlp exceeded {timeout}s",
            "stderr": (exc.stderr or "")[-4000:] if isinstance(exc.stderr, str) else "",
        }, 504

    if completed.returncode != 0:
        status = classify_extractor_failure(completed.stderr)
        return {
            "status": status,
            "detail": "yt-dlp extraction failed",
            "stderr": completed.stderr[-4000:],
        }, 502

    try:
        info = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {
            "status": "extract_error",
            "detail": "yt-dlp returned invalid JSON",
            "stderr": completed.stderr[-4000:],
        }, 502

    return info, 200


def probe_media(info):
    fmt = select_probe_format(info)
    if not fmt:
        return {
            "status": "media_unavailable",
            "detail": "yt-dlp returned no probeable HTTP media formats",
        }, 502

    headers = {}
    headers.update(info.get("http_headers") or {})
    headers.update(fmt.get("http_headers") or {})
    headers["Range"] = "bytes=0-0"
    headers.setdefault("Accept-Encoding", "identity")

    request = urllib.request.Request(fmt["url"], headers=headers, method="GET")
    timeout = int(os.environ.get("MEDIA_PROBE_TIMEOUT", DEFAULT_PROBE_TIMEOUT))
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(1)
            status_code = getattr(response, "status", None)
            if not body:
                return {
                    "status": "media_empty",
                    "detail": "media endpoint returned no body",
                    "format_id": fmt.get("format_id"),
                    "http_status": status_code,
                }, 502
            return {
                "status": "ok",
                "video_id": info.get("id"),
                "title": info.get("title"),
                "format_id": fmt.get("format_id"),
                "ext": fmt.get("ext"),
                "height": fmt.get("height"),
                "http_status": status_code,
                "bytes_read": len(body),
            }, 200
    except urllib.error.HTTPError as exc:
        return {
            "status": "media_http_error",
            "detail": f"media endpoint returned HTTP {exc.code}",
            "format_id": fmt.get("format_id"),
            "http_status": exc.code,
        }, 502
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {
            "status": "media_network_error",
            "detail": str(exc),
            "format_id": fmt.get("format_id"),
        }, 502


def run_probe(url):
    info, status_code = extract_info(url)
    if status_code != 200:
        return info, status_code
    return probe_media(info)


def _authorized(headers):
    expected = os.environ.get("CANARY_API_TOKEN")
    if not expected:
        return True
    return headers.get("Authorization") == f"Bearer {expected}"


class Handler(BaseHTTPRequestHandler):
    server_version = "MediaBridgeYouTubeCanary/1.0"

    def log_message(self, fmt, *args):
        print(f"[youtube-ytdlp-canary] {self.address_string()} {fmt % args}", flush=True)

    def _send_json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/healthz":
            self._send_json(200, {"status": "ok"})
            return
        self._send_json(404, {"status": "not_found"})

    def do_POST(self):
        if self.path != "/probe":
            self._send_json(404, {"status": "not_found"})
            return
        if not _authorized(self.headers):
            self._send_json(401, {"status": "unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"status": "invalid_request"})
            return

        if length <= 0 or length > MAX_BODY_BYTES:
            self._send_json(413 if length > MAX_BODY_BYTES else 400, {"status": "invalid_request"})
            return

        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {"status": "invalid_json"})
            return

        url = payload.get("url") if isinstance(payload, dict) else None
        if not isinstance(url, str) or not is_allowed_youtube_url(url):
            self._send_json(400, {"status": "invalid_youtube_url"})
            return

        result, status = run_probe(url)
        self._send_json(status, result)


def main():
    host = os.environ.get("CANARY_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", os.environ.get("CANARY_PORT", "9000")))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"[youtube-ytdlp-canary] listening on {host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
