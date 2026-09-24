# GitHub Pages test deployment

This fork can build the SvelteKit frontend as a GitHub Pages project site.

Expected URL:

```
https://titonax.github.io/cobalt/
```

## Architecture

Unlike UEFI Editor, cobalt is not a browser-only application. GitHub Pages hosts only the frontend; media extraction, proxying and FFmpeg server-side work require a cobalt API.

For the local test setup used by this fork:

```
GitHub Pages
https://titonax.github.io/cobalt/
            |
            | browser requests
            v
http://localhost:9000/
local cobalt API built from this fork
```

The localhost address is resolved by the browser, not by GitHub Pages. Therefore the API must be running on the same computer where the Pages site is being tested.

## Start the local processing API

Requirements:

- Docker Desktop / Docker Engine
- Docker Compose

From the repository root:

```sh
docker compose -f docker-compose.local.yml up --build -d
```

Check that the API is reachable:

```
http://localhost:9000/
```

It should return cobalt instance information as JSON.

Then open:

```
https://titonax.github.io/cobalt/
```

The Pages build defaults to `http://localhost:9000/`, so pasted media URLs can now be processed by the local API.

Stop it with:

```sh
docker compose -f docker-compose.local.yml down
```

## Browser local-network permission

Modern browsers treat loopback addresses such as `http://localhost` as local/trustworthy resources, but some versions may ask for permission for a public HTTPS page to access the local network/loopback interface. Allow that permission for this test site when prompted.

## Shared or public API

When a permanent HTTPS processing server is available, create a GitHub repository variable:

```
WEB_DEFAULT_API
```

with a value such as:

```
https://api.example.org/
```

Then redeploy Pages. That value overrides the localhost test default, and no frontend code change is required.

Do not point this fork at `api.cobalt.tools` unless the upstream operators explicitly allow it; their hosted API is not intended as a generic backend for third-party frontends.

## Workflow behavior

The `Build and deploy web to Pages` workflow follows the UEFI Editor model:

- every pull request targeting `main` builds and validates the frontend;
- pull requests do not deploy;
- running the workflow manually from `main` builds and deploys the current production branch to GitHub Pages;
- the generated artifact is rejected if the old non-routable `api.example.invalid` placeholder appears.

## One-time GitHub setting

GitHub Pages must be enabled once:

`Settings -> Pages -> Build and deployment -> Source -> GitHub Actions`

## Project-path support

GitHub Pages serves this repository below `/cobalt/`, not at the domain root. The fork therefore:

- sets SvelteKit's base path from `WEB_BASE_PATH`;
- resolves libav assets below that base path;
- uses relative PWA manifest URLs;
- rewrites internal Markdown links for the project base path.

Normal root-domain deployments continue to work because `WEB_BASE_PATH` defaults to an empty string.
