# Render deployment adapter

MediaBridge uses GitHub Pages for the static web client and a separate remote service for the processing API.

The first remote adapter is described by the repository-level `render.yaml`.

## Runtime mapping

Render exposes its public listener through `PORT` and the deployed service URL through `RENDER_EXTERNAL_URL`.

The Blueprint maps those values at process startup without adding Render-specific logic to the application:

```
PORT                 -> API_PORT
RENDER_EXTERNAL_URL  -> API_URL
```

## Health contract

Render checks:

```
GET /healthz
```

A healthy instance returns HTTP 200 and a JSON payload whose `status` is `ok`.

## CORS

The initial adapter accepts browser requests from:

```
https://titonax.github.io
```

If MediaBridge moves to a custom web domain, update `CORS_URL` in the adapter configuration.

## Deployment completion criteria

Do not point GitHub Pages at the remote API until all of these pass:

1. service deploy succeeds;
2. `/healthz` returns 200;
3. root server-info endpoint returns JSON;
4. at least one real service resolver succeeds;
5. tunnel/local-processing response URLs are usable from the browser.

Only then should `WEB_DEFAULT_API` replace the current transitional target.
