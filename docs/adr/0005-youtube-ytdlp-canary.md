# ADR 0005: Isolated yt-dlp YouTube canary

- Status: accepted for diagnostic testing
- Date: 2026-09-26

## Context

The production MediaBridge API receives YouTube bot challenges from multiple
Innertube clients, including `ANDROID_VR`, `ANDROID`, `IOS`, and a custom
`VISIONOS` context. Public Invidious and Piped fallbacks are also unreliable
from the current Railway deployment.

Changing more Innertube clients no longer tells us whether the remaining
failure is extractor-specific or caused by the deployment egress/IP.

Current yt-dlp guidance requires an external JavaScript challenge runtime for
YouTube and recommends a PO-token provider for `mweb` GVS requests. The
`bgutil-ytdlp-pot-provider` project supplies such a provider.

## Decision

Add a separate diagnostic image, `mediabridge-youtube-ytdlp-canary`, containing:

- yt-dlp `2026.08.19` with its default EJS package and `curl_cffi`;
- Node.js 22 as the EJS runtime;
- bgutil PO-token provider `2.0.0`, pinned to commit
  `37169ee2656e08c5c2e5dc9df4c598c0cb4c88a8`;
- a small HTTP probe service restricted to YouTube URLs;
- a one-byte media range probe after successful extraction.

The bgutil HTTP server listens only on `127.0.0.1:4416` inside the container.
The public canary exposes only `/healthz` and `/probe`. `/probe` may be
protected with `CANARY_API_TOKEN`.

The canary is not wired into the production MediaBridge request path.

## Diagnostic outcomes

- `bot_challenge`: yt-dlp plus mweb plus PO-token still receives the YouTube
  login/bot gate. This is strong evidence that changing extractor logic alone
  will not solve the current Railway deployment.
- `media_http_error`: extraction succeeds but the selected Google Video URL
  is blocked at delivery time; egress/media delivery remains the problem.
- `ok`: extraction and a media byte both succeed. At that point the yt-dlp
  path is a viable candidate for a production YouTube provider adapter.

## Consequences

This adds a diagnostic container and GHCR image but does not alter the main API
or frontend. No account cookies, paid proxies, or residential egress are
introduced. Production routing will only be considered after a successful
canary result.
