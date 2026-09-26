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

PROVIDER_DOMAINS = {
    "youtube": ("youtube.com", "youtu.be", "youtube-nocookie.com"),
    "facebook": ("facebook.com", "fb.watch"),
    "instagram": ("instagram.com",),
    "tiktok": ("tiktok.com",),
    "vimeo": ("vimeo.com",),
    "reddit": ("reddit.com", "redd.it"),
    "soundcloud": ("soundcloud.com",),
    "bilibili": ("bilibili.com", "b23.tv"),
    "dailymotion": ("dailymotion.com", "dai.ly"),
    "tumblr": ("tumblr.com",),
    "vk": ("vk.com", "vk.ru", "vkvideo.ru"),
    "twitch": ("twitch.tv",),
    "pinterest": ("pinterest.com", "pin.it"),
    "douyin": ("douyin.com",),
    "mixcloud": ("mixcloud.com",),
    "niconico": ("nicovideo.jp", "nico.ms"),
}


def _host_matches(host, domain):
    return host == domain or host.endswith("." + domain)


def provider_for_url(value):
    try:
        parsed = urllib.parse.urlparse(value)
    except (TypeError, ValueError):
        return None
    if parsed.scheme not in {"http", "https"}:
        return None

    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        return None

    for provider, domains in PROVIDER_DOMAINS.items():
        if any(_host_matches(host, domain) for domain in domains):
            return provider
    return None


def classify_extractor_failure(stderr):
    text = (stderr or "").lower()
    categories = (
        ("bot_challenge", (
            "sign in to confirm you're not a bot",
            "sign in to confirm you’re not a bot",
            "login_required",
            "bot challenge",
        )),
        ("geo_restricted", (
            "not available in your country",
            "geo-restricted",
            "geo restricted",
            "not available in your region",
        )),
        ("auth_required", (
            "login required",
            "log in to",
            "sign in to",
            "cookies are needed",
            "cookies are required",
            "age-restricted",
            "age restricted",
            "private video",
            "private content",
        )),
        ("unsupported_url", (
            "unsupported url",
            "no suitable extractor",
        )),
    )
    for status, markers in categories:
        if any(marker in text for marker in markers):
            return status
    return "extract_error"


def _iter_probe_candidates(info):
    for fmt in info.get("formats") or []:
        yield fmt
    for fmt in info.get("requested_formats") or []:
        yield fmt
    if info.get("url"):
        yield info


def select_probe_format(info):
    candidates = []
    seen_urls = set()

    for fmt in _iter_probe_candidates(info):
        url = fmt.get("url")
        protocol = str(fmt.get("protocol") or "")
        if not url or not url.startswith(("http://", "https://")):
            continue
        if url in seen_urls:
            continue
        seen_urls.add(url)
        if protocol and not (
            protocol.startswith("http")
            or protocol in {"https", "http", "m3u8", "m3u8_native"}
        ):
            continue

        has_audio = fmt.get("acodec") not in {None, "none"}
        has_video = fmt.get("vcodec") not in {None, "none"}
        is_image = str(fmt.get("ext") or "").lower() in {"jpg", "jpeg", "png", "webp", "gif"}
        height = fmt.get("height") or 0
        filesize = fmt.get("filesize") or fmt.get("filesize_approx") or 0
        preferred_height = height if height and height <= 480 else 10_000 + height
        candidates.append((
            0 if (has_audio and has_video) else 1 if (has_audio or has_video) else 2 if is_image else 3,
            preferred_height,
            filesize,
            str(fmt.get("format_id") or ""),
            fmt,
        ))

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[:4])
    return candidates[0][4]


def build_ytdlp_command(url, provider=None):
    provider = provider or provider_for_url(url)
    command = [
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
    ]

    if provider == "youtube":
        command.extend([
            "--extractor-args",
            "youtube:player_client=mweb",
            "--extractor-args",
            "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416",
        ])

    command.append(url)
    return command


def extract_info(url, provider):
    timeout = int(os.environ.get("YTDLP_EXTRACT_TIMEOUT", DEFAULT_EXTRACT_TIMEOUT))
    try:
        completed = subprocess.run(
            build_ytdlp_command(url, provider),
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "status": "extract_timeout",
            "provider": provider,
            "detail": f"yt-dlp exceeded {timeout}s",
            "stderr": (exc.stderr or "")[-4000:] if isinstance(exc.stderr, str) else "",
        }, 504

    if completed.returncode != 0:
        status = classify_extractor_failure(completed.stderr)
        return {
            "status": status,
            "provider": provider,
            "detail": "yt-dlp extraction failed",
            "stderr": completed.stderr[-4000:],
        }, 502

    try:
        info = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {
            "status": "extract_error",
            "provider": provider,
            "detail": "yt-dlp returned invalid JSON",
            "stderr": completed.stderr[-4000:],
        }, 502

    return info, 200


def probe_media(info, provider):
    fmt = select_probe_format(info)
    if not fmt:
        return {
            "status": "media_unavailable",
            "provider": provider,
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
                    "provider": provider,
                    "detail": "media endpoint returned no body",
                    "format_id": fmt.get("format_id"),
                    "http_status": status_code,
                }, 502
            return {
                "status": "ok",
                "provider": provider,
                "media_id": info.get("id"),
                "title": info.get("title"),
                "format_id": fmt.get("format_id"),
                "ext": fmt.get("ext"),
                "height": fmt.get("height"),
                "http_status": status_code,
                "bytes_read": len(body),
                "extractor": info.get("extractor_key") or info.get("extractor"),
            }, 200
    except urllib.error.HTTPError as exc:
        return {
            "status": "media_http_error",
            "provider": provider,
            "detail": f"media endpoint returned HTTP {exc.code}",
            "format_id": fmt.get("format_id"),
            "http_status": exc.code,
        }, 502
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {
            "status": "media_network_error",
            "provider": provider,
            "detail": str(exc),
            "format_id": fmt.get("format_id"),
        }, 502


def run_probe(url):
    provider = provider_for_url(url)
    if not provider:
        return {"status": "unsupported_provider"}, 400

    info, status_code = extract_info(url, provider)
    if status_code != 200:
        return info, status_code
    return probe_media(info, provider)


def _authorized(headers):
    expected = os.environ.get("CANARY_API_TOKEN")
    if not expected:
        return True
    return headers.get("Authorization") == f"Bearer {expected}"


class Handler(BaseHTTPRequestHandler):
    server_version = "MediaBridgeProviderCanary/2.0"

    def log_message(self, fmt, *args):
        print(f"[provider-ytdlp-canary] {self.address_string()} {fmt % args}", flush=True)

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
            self._send_json(200, {
                "status": "ok",
                "providers": sorted(PROVIDER_DOMAINS),
            })
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
            self._send_json(
                413 if length > MAX_BODY_BYTES else 400,
                {"status": "invalid_request"},
            )
            return

        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {"status": "invalid_json"})
            return

        url = payload.get("url") if isinstance(payload, dict) else None
        if not isinstance(url, str):
            self._send_json(400, {"status": "invalid_url"})
            return

        provider = provider_for_url(url)
        if not provider:
            self._send_json(400, {"status": "unsupported_provider"})
            return

        result, status = run_probe(url)
        self._send_json(status, result)


def main():
    host = os.environ.get("CANARY_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", os.environ.get("CANARY_PORT", "9000")))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"[provider-ytdlp-canary] listening on {host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
