# ADR 0004: use a browserless YouTube PO-token generator

- Status: accepted
- Date: 2026-09-25
- Supersedes: ADR 0003 implementation choice

## Context

ADR 0003 established the important deployment constraint: PO-token generation
and MediaBridge should share the same network egress. Its first implementation
used the browser-based `imputnet/yt-session-generator`.

Railway reproduced two independent failures in that implementation:

1. Chromium could not initially start as root without disabling its sandbox.
2. After the sandbox issue was corrected, Chromium started but the generator
   still timed out waiting for the `/youtubei/v1/player` request it expected
   to intercept.

The second failure means the old browser-interception mechanism is no longer a
reliable foundation for the specialized image.

## Decision

Keep the co-location architecture, but replace Chromium/Xvfb/Python with the
browserless `idMJA/youtube-trusted-session-generator` implementation.

The source is pinned to commit:

```
bc48b66471bf886dd7f707e4fd7fef281e87f69a
```

The image patches its runtime selection to use the existing single-thread
generator. This avoids spawning one worker per visible CPU when only one
session is required.

The internal contract remains:

```
GET http://127.0.0.1:8080/token
=> { "visitorData": "...", "poToken": "..." }
```

MediaBridge already normalizes these names to its internal
`visitor_data`/`potoken` representation.

## Consequences

- Token generation and YouTube requests still share container egress.
- Chromium, Xvfb and Python are removed from the specialized runtime.
- The normal MediaBridge image remains unchanged.
- The upstream generator revision is explicit and auditable.
- The startup wrapper refuses to start MediaBridge until a token pair exists.
- If the generator exits later, the specialized container exits instead of
  continuing indefinitely with stale state.
- A valid PO token still does not guarantee that a datacenter egress will be
  accepted by every YouTube media endpoint.
