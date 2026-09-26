# GitHub Pages deployment

MediaBridge-GPT uses GitHub Pages for the static web application and a separate HTTPS processing API for server-side extraction, proxying, tunnels, and FFmpeg work.

## Public web URL

```
https://titonax.github.io/MediaBridge-GPT/
```

## Processing API

The Pages build currently targets:

```
https://mediabridge-api-production.up.railway.app/
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

This means a green Pages deployment represents both a valid static build and a reachable MediaBridge-GPT processing API at build time.

## Architecture

```
https://titonax.github.io/MediaBridge-GPT/
                  |
                  | HTTPS
                  v
https://mediabridge-api-production.up.railway.app/
                  |
                  +-- /healthz
                  +-- media resolvers
                  +-- tunnel/proxy
                  +-- server processing
```

GitHub Pages never runs the Node backend itself.

## Railway processing service

The processing API currently runs on Railway from the MediaBridge-GPT GHCR image. The Pages health gate verifies the public API before building the static site.

## Project-path support

GitHub Pages serves project sites below the current repository name, not at the domain root. The workflow derives `WEB_BASE_PATH` from `github.event.repository.name`, so a repository rename is picked up automatically without another code change. The intended MediaBridge-GPT path is `/MediaBridge-GPT/`. The web build therefore:

- sets SvelteKit's base path from `WEB_BASE_PATH`;
- resolves libav assets below that base path;
- uses relative PWA manifest URLs;
- rewrites internal Markdown links for the project base path.

Normal root-domain deployments continue to work because `WEB_BASE_PATH` defaults to an empty string.
