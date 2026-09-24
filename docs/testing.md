# Service regression testing

MediaBridge separates deterministic CI from live third-party smoke tests.

## Deterministic checks

Unit, build, type, API sanity and container-build checks are expected to be deterministic and block a pull request when they fail.

## Live service smoke tests

Tests that call YouTube, Instagram, Vimeo, Reddit, and other third-party services are **observed by default**. External services can rate-limit, change responses, require authentication, or be temporarily unavailable; those failures remain visible in Actions but do not block unrelated infrastructure changes.

The policy is stored in:

```
api/src/util/service-test-policy.json
```

A repaired service is promoted to a regression gate by adding its service id to `strict`:

```json
{
    "strict": ["instagram"]
}
```

Once strict, a failure from that service makes CI fail.

An optional repository variable named `TEST_STRICT_SERVICES` can temporarily override the version-controlled strict list for diagnostics. Permanent policy changes should be committed to the JSON file so they are reviewable.

Individual test cases explicitly marked `canFail` remain allowed to fail.

## Rule

The intended sequence is:

```
reproduce -> add regression case -> fix -> verify -> promote to strict
```

This prevents a changing third-party website from making unrelated MediaBridge PRs nondeterministic while still giving us a ratchet against regressions we have already fixed.
