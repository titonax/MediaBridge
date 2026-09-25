#!/bin/sh
set -eu

if [ -z "${API_PORT:-}" ]; then
    API_PORT="${PORT:-9000}"
fi

: "${API_LISTEN_ADDRESS:=0.0.0.0}"
: "${YOUTUBE_SESSION_SERVER:=http://127.0.0.1:8080}"
: "${YOUTUBE_SESSION_INNERTUBE_CLIENT:=MWEB}"

if [ -z "${API_URL:-}" ]; then
    if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
        API_URL="https://${RAILWAY_PUBLIC_DOMAIN}"
    elif [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
        API_URL="${RENDER_EXTERNAL_URL}"
    fi
fi

export API_URL
export API_PORT
export API_LISTEN_ADDRESS
export YOUTUBE_SESSION_SERVER
export YOUTUBE_SESSION_INNERTUBE_CLIENT

XVFB_WHD="${XVFB_WHD:-1280x720x16}"
SESSION_PORT=8080
SESSION_URL="http://127.0.0.1:${SESSION_PORT}/token"

echo "[mediabridge] starting Xvfb for YouTube PO-token generator"
Xvfb :99 -ac -screen 0 "${XVFB_WHD}" -nolisten tcp >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

export DISPLAY=:99

cleanup() {
    kill "${SESSION_PID:-}" "${XVFB_PID:-}" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "[mediabridge] starting YouTube PO-token generator on 127.0.0.1:${SESSION_PORT}"
/opt/yt-session/venv/bin/python \
    /opt/yt-session/potoken-generator.py \
    --bind 127.0.0.1 \
    --port "${SESSION_PORT}" &
SESSION_PID=$!

echo "[mediabridge] waiting for initial YouTube PO token"
attempt=1
while [ "${attempt}" -le 60 ]; do
    if ! kill -0 "${SESSION_PID}" 2>/dev/null; then
        echo "[mediabridge] PO-token generator exited before becoming ready"
        exit 1
    fi

    if wget -qO /tmp/youtube-session.json "${SESSION_URL}" 2>/dev/null; then
        if grep -q '"potoken"' /tmp/youtube-session.json \
            && grep -q '"visitor_data"' /tmp/youtube-session.json; then
            echo "[mediabridge] YouTube PO-token session is ready"
            break
        fi
    fi

    if [ "${attempt}" -eq 60 ]; then
        echo "[mediabridge] PO-token generator did not become ready in time"
        exit 1
    fi

    attempt=$((attempt + 1))
    sleep 2
done

echo "[mediabridge] starting API with co-located YouTube session generator"
trap - EXIT
exec su-exec node node /app/src/cobalt
