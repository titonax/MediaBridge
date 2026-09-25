# ADR 0003: co-locate the YouTube PO-token generator

- Status: superseded by ADR 0004
- Date: 2026-09-25

## Context

YouTube currently challenges MediaBridge requests from public datacenter
egress with bot verification. The same behavior has been observed from more
than one cloud provider.

MediaBridge already supports `po_token` and `visitor_data`, but the official
session generator states that tokens should be generated from the same public
IP as the YouTube traffic that consumes them.

Running the token generator as an unrelated remote service can therefore
produce a session bound to a different egress path.

## Decision

Provide a dedicated deployment image,
`Dockerfile.youtube-session`, that runs:

1. Xvfb;
2. the official `imputnet/yt-session-generator` webserver on localhost;
3. the MediaBridge API.

The generator binds only to `127.0.0.1:8080` and is not exposed publicly.
MediaBridge reads it through:

```
YOUTUBE_SESSION_SERVER=http://127.0.0.1:8080
YOUTUBE_SESSION_INNERTUBE_CLIENT=MWEB
```

The normal MediaBridge API image remains unchanged. This keeps YouTube's
special deployment requirements isolated from the generic API runtime.

## Startup contract

The container waits for `/token` to contain both `potoken` and
`visitor_data` before starting the API. If the token generator cannot become
ready, the specialized container fails rather than silently running without
the capability it exists to provide.

## Consequences

- Token generation and YouTube requests share the exact container egress.
- No token-generator port is exposed to the internet.
- The specialized image is larger because it contains Chromium and Python.
- Providers can deploy the normal image when YouTube session generation is not
  required.
- This does not guarantee YouTube will accept a given datacenter IP; it makes
  the PO-token test technically valid before considering a different egress.
