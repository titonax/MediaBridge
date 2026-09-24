# ADR 0002: use Render as the first remote API deployment adapter

- Status: proposed
- Date: 2026-09-24

## Context

MediaBridge's GitHub Pages frontend requires a remote processing API. GitHub Pages cannot run the Node/Express/FFmpeg runtime used by the API.

ADR 0001 requires hosting providers to remain deployment adapters rather than application dependencies.

## Decision

Use Render as the first remote deployment adapter for the MediaBridge API.

The adapter is declared in `render.yaml` and uses the repository Dockerfile.

Provider-specific runtime variables are translated in the deployment command:

- Render `PORT` -> MediaBridge `API_PORT`
- Render `RENDER_EXTERNAL_URL` -> MediaBridge `API_URL`

Application code does not import Render-specific variables.

The web service:

- runs in Frankfurt;
- uses `GET /healthz` for readiness/liveness;
- binds on `0.0.0.0`;
- restricts CORS to `https://titonax.github.io`;
- deploys only after GitHub checks pass.

## Free-plan limitation

The initial service uses Render's free plan for development/testing. It may spin down after inactivity and should not be treated as a production SLA.

Moving to another Render plan or a different provider must not require changes to resolver code.

## Promotion sequence

1. Validate this Blueprint.
2. Create the Render service.
3. Confirm `/healthz`.
4. Confirm a real resolver request.
5. Set the Pages processing API target to the deployed HTTPS URL.
6. Remove the localhost fallback.
7. Add browser-side API health/status reporting.

## Rollback

Until steps 1-4 succeed, the Pages configuration remains unchanged.
