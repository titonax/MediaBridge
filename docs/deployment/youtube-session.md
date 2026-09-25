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

The official `imputnet/yt-session-generator` documentation requires the
PO token to be generated from the same public IP, or a compatible network
range, as the YouTube traffic that consumes it.

The specialized image therefore runs the generator and MediaBridge in one
container:

```
container
├── Xvfb
├── Chromium / yt-session-generator
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
```

Explicit environment values can override those defaults.

## Startup behavior

The container waits up to approximately two minutes for the first valid
`po_token` + `visitor_data` pair. MediaBridge starts only after the token
endpoint is ready.

This makes startup failure visible instead of quietly falling back to an
anonymous YouTube session.

## Deployment test

After deployment:

1. verify `GET /healthz`;
2. verify logs contain `YouTube PO-token session is ready`;
3. submit the same public YouTube test URL;
4. inspect MediaBridge logs for
   `pot session retry client=MWEB result=ok` or the exact failure reason.

If YouTube still returns the bot challenge after a valid co-located PO-token
retry, the remaining problem is the egress reputation itself rather than
session-generator placement.


## Railway

For a Railway service connected to the MediaBridge repository, select the
specialized Dockerfile by setting:

```
RAILWAY_DOCKERFILE_PATH=Dockerfile.youtube-session
```

The startup wrapper automatically maps Railway's `PORT` to MediaBridge's
`API_PORT`. If `API_URL` is not set and Railway provides
`RAILWAY_PUBLIC_DOMAIN`, the public API URL is derived automatically as
`https://$RAILWAY_PUBLIC_DOMAIN`.

After changing `RAILWAY_DOCKERFILE_PATH`, redeploy the service. A successful
startup should show both:

```
[mediabridge] YouTube PO-token session is ready
[✓] poToken & visitor_data loaded successfully!
```

before testing YouTube.
