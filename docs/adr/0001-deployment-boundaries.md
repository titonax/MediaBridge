# ADR 0001: split web and API deployment boundaries

- Status: accepted
- Date: 2026-09-24

## Context

MediaBridge started from the current cobalt codebase, but its deployment model is intentionally independent.

The web application can be hosted as static assets on GitHub Pages. The processing API cannot: it requires a long-running Node.js process, network access to media providers, tunnel/proxy support, and server-side dependencies such as FFmpeg and isolated-vm.

Treating those two runtimes as if they were one deployment creates hidden assumptions, such as a Pages build that appears healthy while its processing API is unavailable.

## Decision

MediaBridge has two explicit deployment units.

### Web

- built from `web/`;
- deployed to GitHub Pages;
- must receive the processing API URL through `WEB_DEFAULT_API`;
- never owns server-side extraction or proxy responsibilities.

### API

- built from `api/`, `packages/`, and the root `Dockerfile`;
- published as `ghcr.io/titonax/mediabridge-api`;
- exposes `GET /healthz` as the stable liveness contract;
- requires `API_URL` at runtime;
- must fail clearly when required runtime configuration is absent.

## CI rules

1. Pull requests build the API image but do not publish it.
2. Pushes to `main` publish immutable SHA-tagged images and update `latest`.
3. A remote hosting provider is a deployment adapter, not part of application logic.
4. Provider-specific configuration belongs under deployment workflows/configuration, not inside resolvers.
5. Pages deployment and API deployment must be independently observable.

## Consequences

This keeps service extraction logic independent from hosting choices and lets us change the API provider without rewriting the application.

Until a remote API provider is connected, the existing Pages API target remains transitional. Removing that transitional target belongs to the deployment-adapter PR, not this foundation PR.
