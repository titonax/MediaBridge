# service regression testing

cobalt depends on external services that can change without notice. this fork keeps those failures visible while allowing known-flaky services to be promoted to hard regression gates one at a time.

## test modes

service tests have three effective modes:

- **default**: failures fail CI.
- **observed**: service-level failures are reported as warnings but do not fail CI.
- **strict**: overrides the observed/finnicky service setting and makes failures fail CI.

individual test cases with `"canFail": true` remain explicitly allowed to fail in every mode.

## repository variables

the service test workflow understands two comma-separated repository variables:

### `TEST_IGNORE_SERVICES`

replaces the built-in list of externally unreliable services whose failures are observed rather than gated.

if the variable is not configured, cobalt's current default list is used:

```
bilibili,instagram,facebook,youtube,vk,twitter,reddit
```

### `TEST_STRICT_SERVICES`

promotes selected services to strict regression gates even when they are in the ignore/finnicky list.

example:

```
instagram,youtube
```

this lets us fix one service, add regression cases for it, and then make that service mandatory without changing the test runner again.

## github actions visibility

each service matrix job writes a step summary containing:

- passed tests
- hard failures
- ignored failures
- active test mode

ignored failures therefore remain visible instead of being indistinguishable from a clean test run.

## local examples

run one service using the default behavior:

```sh
cd api
node src/util/test run-tests-for instagram
```

make instagram strict locally:

```sh
cd api
TEST_STRICT_SERVICES=instagram node src/util/test run-tests-for instagram
```

replace the observed/finnicky list:

```sh
cd api
TEST_IGNORE_SERVICES=instagram,youtube node src/util/test run-tests-for instagram
```

the intended workflow for this fork is to add a reproducible regression case first, fix the resolver, and then promote the repaired service through `TEST_STRICT_SERVICES`.
