# Provider compatibility audit

MediaBridge tracks upstream Cobalt provider regressions separately from new
service requests. The goal is to reproduce failures before changing extractor
code and to keep a small regression case for every confirmed fix.

## Upstream snapshot

Snapshot date: 2026-09-26.

The upstream `imputnet/cobalt` repository currently has:

- 28 open issues labelled `bug`;
- 38 open issues labelled `main instance issue`;
- 28 open issues labelled `service request`.

The first automated matrix focuses on provider bugs with concrete reproduction
URLs. UI/browser-specific cases are recorded in the same manifest but remain
manual when a GitHub runner cannot reproduce the reported environment.

## Coverage levels

- `api-and-media`: POST the source URL to the MediaBridge API, require a
  successful response, then read at least one byte from returned media/tunnel
  targets.
- `partial`: exercises the provider/API path but does not reproduce a
  browser/device-specific part of the upstream issue.
- `manual`: requires a specific browser, mobile OS, downstream application,
  account state, or other environment that should not be simulated in CI.

A HTTP 200 alone is not considered success. The runner reads media bytes so an
empty tunnel is reported as a failure.

## Current issue-driven cases

The initial matrix covers regressions reported for:

- YouTube;
- Vimeo;
- Facebook;
- Bilibili;
- X/Twitter, including a GIF/transcode path;
- TikTok;
- Pinterest, including an original-image quality assertion;
- Newgrounds;
- SoundCloud;
- Bluesky;
- OK.ru.

Source issue numbers are stored in `.github/provider-smoke-cases.json`.

## Execution policy

Pull requests only validate the manifest and runner. Live external-network
checks run after changes land on `main`, and can also be started manually with
a custom API URL.

Live failures are diagnostic rather than merge-blocking because external
services can rate-limit, geo-block, delete fixtures, or change behavior without
a MediaBridge code change. A red case must be reproduced and classified before
opening a provider fix.

## New services

New-service requests are intentionally handled after the supported-provider
regression pass. Each candidate should have:

1. public, non-DRM sample URLs;
2. a documented URL pattern;
3. stable metadata/media extraction;
4. unit tests for parsing;
5. a live smoke fixture when the service permits it.

Authenticated, paid, or DRM-protected material is not used as a compatibility
fixture.
