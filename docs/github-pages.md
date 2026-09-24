# GitHub Pages deployment

MediaBridge uses GitHub Pages for the static web application and a separate HTTPS processing API for server-side extraction, proxying, tunnels, and FFmpeg work.

## Public web URL

```
https://titonax.github.io/MediaBridge/
```

## Processing API

The Pages build currently targets:

```
https://mediabridge-processing-api.onrender.com/
```

The API exposes a stable liveness endpoint:

```
GET /healthz
```

A valid response must contain:

```json
{
  "status": "ok",
  "service": "mediabridge-api"
}
```

## Deployment gate

The Pages workflow does not blindly publish a frontend that points at a dead backend.

Before building the web application it:

1. requires the processing API URL to use HTTPS;
2. requests `/healthz`;
3. retries to allow a sleeping development instance to wake up;
4. requires `status=ok` and `service=mediabridge-api`;
5. builds the SvelteKit application only after that contract passes;
6. rejects artifacts that still contain `localhost:9000` or the old invalid placeholder.

This means a green Pages deployment represents both a valid static build and a reachable MediaBridge processing API at build time.

## Architecture

```
https://titonax.github.io/MediaBridge/
                  |
                  | HTTPS
                  v
https://mediabridge-processing-api.onrender.com/
                  |
                  +-- /healthz
                  +-- media resolvers
                  +-- tunnel/proxy
                  +-- server processing
```

GitHub Pages never runs the Node backend itself.

## Render development-service behavior

The initial processing instance uses a development/free Render service. It can spin down after inactivity, so the first request after a quiet period can take longer while the service wakes.

The Pages health gate retries for this reason.

## Project-path support

GitHub Pages serves this repository below `/MediaBridge/`, not at the domain root. The web build therefore:

- sets SvelteKit's base path from `WEB_BASE_PATH`;
- resolves libav assets below that base path;
- uses relative PWA manifest URLs;
- rewrites internal Markdown links for the project base path.

Normal root-domain deployments continue to work because `WEB_BASE_PATH` defaults to an empty string.
