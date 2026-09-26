#!/bin/sh
set -eu

POT_PID=""
APP_PID=""

cleanup() {
    [ -z "$APP_PID" ] || kill "$APP_PID" 2>/dev/null || true
    [ -z "$POT_PID" ] || kill "$POT_PID" 2>/dev/null || true
    [ -z "$APP_PID" ] || wait "$APP_PID" 2>/dev/null || true
    [ -z "$POT_PID" ] || wait "$POT_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

node /opt/bgutil/server/build/main.js --host 127.0.0.1 --port 4416 &
POT_PID=$!

i=0
while [ "$i" -lt 30 ]; do
    if curl -fsS http://127.0.0.1:4416/ping >/dev/null 2>&1; then
        break
    fi
    if ! kill -0 "$POT_PID" 2>/dev/null; then
        echo "[youtube-ytdlp-canary] bgutil provider exited during startup" >&2
        exit 1
    fi
    i=$((i + 1))
    sleep 1
done

if ! curl -fsS http://127.0.0.1:4416/ping >/dev/null 2>&1; then
    echo "[youtube-ytdlp-canary] bgutil provider did not become ready" >&2
    exit 1
fi

echo "[youtube-ytdlp-canary] bgutil provider ready on 127.0.0.1:4416"
python3 /opt/youtube-canary/app.py &
APP_PID=$!

while kill -0 "$POT_PID" 2>/dev/null && kill -0 "$APP_PID" 2>/dev/null; do
    sleep 2
done

echo "[youtube-ytdlp-canary] a supervised process exited" >&2
exit 1
