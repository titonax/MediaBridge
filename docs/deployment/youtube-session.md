# YouTube session bundle

MediaBridge publishes a specialized API image for testing YouTube with a
co-located Proof-of-Origin session generator:

```
ghcr.io/titonax/mediabridge-api-youtube-session:latest
```

The normal API image remains:

```
ghcr.io/titonax/mediabridge-api:latest
```

## Why this image exists

PO tokens are useful only when the token-generating session matches the
network identity used by the requests that consume them. The specialized
image therefore keeps token generation and MediaBridge in the same container
and on the same egress path.

The original browser-based generator became unreliable after YouTube stopped
emitting the browser request it expected to intercept. MediaBridge now uses a
browserless generator derived from
`idMJA/youtube-trusted-session-generator`, pinned to commit
`bc48b66471bf886dd7f707e4fd7fef281e87f69a`.

```
container
├── browserless PO-token generator (Bun)
│   └── 127.0.0.1:8080
└── MediaBridge API
    └── $API_PORT
```

Only the MediaBridge API port is public.

## Defaults

The image supplies:

```
YOUTUBE_SESSION_SERVER=http://127.0.0.1:8080
YOUTUBE_SESSION_INNERTUBE_CLIENT=MWEB
YOUTUBE_SESSION_REFRESH_INTERVAL_MS=300000
```

Explicit environment values can override those defaults.

## Startup behavior

The container waits for the first valid `poToken` + `visitorData` pair.
MediaBridge starts only after the token endpoint is ready. Startup therefore
fails visibly instead of silently falling back to an anonymous session.

The wrapper also supervises the generator after startup. If the generator
exits while MediaBridge is running, the specialized container exits so the
platform can restart it instead of serving indefinitely with stale session
state.

## Deployment test

After deployment:

1. verify `GET /healthz`;
2. verify logs contain `YouTube PO-token session is ready`;
3. verify MediaBridge logs contain
   `poToken & visitor_data loaded successfully!`;
4. submit the same public YouTube test URL;
5. inspect logs for
   `pot session retry client=MWEB result=ok` or the exact failure reason.

If a valid co-located session is loaded but the media tunnel still returns no
usable bytes, treat the PO-token path and the media-delivery path as separate
problems and inspect the final `googlevideo.com` response.

## Railway

For a Railway service connected to the MediaBridge repository, select the
specialized Dockerfile:

```
RAILWAY_DOCKERFILE_PATH=Dockerfile.youtube-session
```

The startup wrapper maps Railway's `PORT` to MediaBridge's `API_PORT`. If
`API_URL` is not set and Railway provides `RAILWAY_PUBLIC_DOMAIN`, the
public API URL is derived automatically as
`https://$RAILWAY_PUBLIC_DOMAIN`.

A successful startup should show:

```
[mediabridge] YouTube PO-token session is ready
[✓] poToken & visitor_data loaded successfully!
```
