#!/bin/sh
set -eu

if [ -z "${API_PORT:-}" ]; then
    API_PORT="${PORT:-9000}"
fi

: "${API_LISTEN_ADDRESS:=0.0.0.0}"
: "${YOUTUBE_SESSION_SERVER:=http://127.0.0.1:8080}"
: "${YOUTUBE_SESSION_INNERTUBE_CLIENT:=MWEB}"
: "${YOUTUBE_SESSION_REFRESH_INTERVAL_MS:=300000}"

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

SESSION_PORT=8080
SESSION_URL="http://127.0.0.1:${SESSION_PORT}/token"

cleanup() {
    kill "${API_PID:-}" "${SESSION_PID:-}" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "[mediabridge] starting browserless YouTube PO-token generator on 127.0.0.1:${SESSION_PORT}"
su-exec node env \
    PORT="${SESSION_PORT}" \
    REFRESH_INTERVAL="${YOUTUBE_SESSION_REFRESH_INTERVAL_MS}" \
    bun /opt/yt-session/src/index.ts &
SESSION_PID=$!

echo "[mediabridge] waiting for initial YouTube PO token"
attempt=1
while [ "${attempt}" -le 75 ]; do
    if ! kill -0 "${SESSION_PID}" 2>/dev/null; then
        echo "[mediabridge] PO-token generator exited before becoming ready"
        exit 1
    fi

    if wget -qO /tmp/youtube-session.json "${SESSION_URL}" 2>/dev/null; then
        if grep -q '"poToken"' /tmp/youtube-session.json \
            && grep -q '"visitorData"' /tmp/youtube-session.json; then
            echo "[mediabridge] YouTube PO-token session is ready"
            break
        fi
    fi

    if [ "${attempt}" -eq 75 ]; then
        echo "[mediabridge] PO-token generator did not become ready in time"
        exit 1
    fi

    attempt=$((attempt + 1))
    sleep 2
done

echo "[mediabridge] starting API with co-located YouTube session generator"
su-exec node node /app/src/cobalt &
API_PID=$!

while kill -0 "${SESSION_PID}" 2>/dev/null \
    && kill -0 "${API_PID}" 2>/dev/null; do
    sleep 5
done

if ! kill -0 "${SESSION_PID}" 2>/dev/null; then
    echo "[mediabridge] PO-token generator exited while API was running"
    kill "${API_PID}" 2>/dev/null || true
    wait "${API_PID}" 2>/dev/null || true
    exit 1
fi

wait "${API_PID}"
status=$?
cleanup
trap - EXIT
exit "${status}"
