# ADR 0005: Isolated yt-dlp provider compatibility canary

- Status: accepted for diagnostic testing
- Date: 2026-09-26

## Context

The production MediaBridge API originally received YouTube bot challenges from
multiple Innertube clients. The isolated yt-dlp + bgutil canary demonstrated
that an independent extraction path could succeed where the built-in Cobalt
YouTube path failed.

The upstream Cobalt issue tracker also contains active regressions for Facebook,
TikTok, Instagram, Reddit, Vimeo, SoundCloud, Bilibili, Dailymotion, Tumblr,
VK, Pinterest and other providers. Debugging every extractor directly is slow
because it does not first tell us whether the failure is in Cobalt, the remote
provider, the deployment egress, or media delivery.

## Decision

Generalize the existing canary into a provider compatibility probe while
preserving the YouTube-specific PO-token flow.

The canary supports an explicit host allowlist for YouTube, Facebook, Instagram,
TikTok, Vimeo, Reddit, SoundCloud, Bilibili, Dailymotion, Tumblr, VK, Twitch,
Pinterest, Douyin, Mixcloud and NicoNico.

YouTube continues to use the mweb player client and the co-located bgutil
PO-token provider. Other providers use their native yt-dlp extractor without
YouTube-specific arguments.

The public canary exposes only /healthz and /probe. /probe can be protected
with CANARY_API_TOKEN. Arbitrary hosts are rejected to avoid turning the
service into a generic SSRF primitive.

After extraction, the canary performs a one-byte media request. This separates
metadata/extractor success from actual media delivery.

## Diagnostic outcomes

- ok: extraction and media delivery both work.
- bot_challenge: provider rejected the request as automated traffic.
- auth_required: content requires login/cookies or is age/private restricted.
- geo_restricted: content is unavailable from the canary region.
- unsupported_url: yt-dlp does not recognize the URL.
- extract_error: provider-specific extraction failed.
- media_http_error: extraction worked but media delivery returned an HTTP error.
- media_network_error: media delivery failed at the network layer.
- media_empty: media endpoint returned no bytes.
- media_unavailable: extractor returned no probeable HTTP media URL.

## Consequences

The canary becomes a reusable compatibility lab for upstream Cobalt issues.
It remains isolated from the production MediaBridge request path. A provider
will only be considered for production fallback routing after its original
issue URLs succeed in the canary and regression tests exist in MediaBridge.
