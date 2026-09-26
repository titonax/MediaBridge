#!/bin/sh
set -eu

POT_PID=""

cleanup() {
    if [ -n "$POT_PID" ]; then
        kill "$POT_PID" 2>/dev/null || true
        wait "$POT_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

if [ -n "${YOUTUBE_YTDLP_BIN:-}" ] && [ -d /opt/bgutil/server ]; then
    node /opt/bgutil/server/build/main.js --host 127.0.0.1 --port 4416 &
    POT_PID=$!

    i=0
    while [ "$i" -lt 30 ]; do
        if curl -fsS http://127.0.0.1:4416/ping >/dev/null 2>&1; then
            echo "[mediabridge] yt-dlp bgutil provider ready on 127.0.0.1:4416"
            break
        fi

        if ! kill -0 "$POT_PID" 2>/dev/null; then
            echo "[mediabridge] yt-dlp bgutil provider exited during startup; disabling yt-dlp fallback" >&2
            POT_PID=""
            unset YOUTUBE_YTDLP_BIN
            unset YOUTUBE_YTDLP_BGUTIL_URL
            break
        fi

        i=$((i + 1))
        sleep 1
    done

    if [ -n "$POT_PID" ] && ! curl -fsS http://127.0.0.1:4416/ping >/dev/null 2>&1; then
        echo "[mediabridge] yt-dlp bgutil provider did not become ready; disabling yt-dlp fallback" >&2
        kill "$POT_PID" 2>/dev/null || true
        wait "$POT_PID" 2>/dev/null || true
        POT_PID=""
        unset YOUTUBE_YTDLP_BIN
        unset YOUTUBE_YTDLP_BGUTIL_URL
    fi
fi

node /app/src/cobalt
