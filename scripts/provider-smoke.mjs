#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

const MANIFEST_URL = new URL("../.github/provider-smoke-cases.json", import.meta.url);
const REPORT_PATH = process.env.PROVIDER_SMOKE_REPORT || "provider-smoke-report.json";
const API_TIMEOUT_MS = Number(process.env.PROVIDER_API_TIMEOUT_MS || 45_000);
const MEDIA_TIMEOUT_MS = Number(process.env.PROVIDER_MEDIA_TIMEOUT_MS || 25_000);

const argv = new Set(process.argv.slice(2));
const validateOnly = argv.has("--validate-only");
const allowFailures = argv.has("--allow-failures");

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function validateManifest(manifest) {
    assert(manifest && typeof manifest === "object", "manifest must be an object");
    assert(Array.isArray(manifest.cases), "manifest.cases must be an array");

    const ids = new Set();
    for (const item of manifest.cases) {
        assert(item && typeof item === "object", "each case must be an object");
        assert(typeof item.id === "string" && item.id, "case.id is required");
        assert(!ids.has(item.id), `duplicate case id: ${item.id}`);
        ids.add(item.id);
        assert(typeof item.service === "string" && item.service, `${item.id}: service is required`);
        assert(Number.isInteger(item.sourceIssue), `${item.id}: sourceIssue must be an integer`);
        if (!item.manual) {
            assert(typeof item.url === "string" && /^https?:\/\//.test(item.url), `${item.id}: valid url is required`);
        }
        if (item.assertions?.targetUrlMustContain) {
            assert(typeof item.assertions.targetUrlMustContain === "string", `${item.id}: targetUrlMustContain must be a string`);
        }
    }
}

function mergeRequest(defaults, item) {
    return {
        ...(defaults || {}),
        ...(item.request || {}),
        url: item.url,
    };
}

async function fetchWithTimeout(url, options, timeoutMs) {
    return fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
    });
}

async function processCase(apiBase, manifest, item) {
    if (item.manual) {
        return {
            id: item.id,
            service: item.service,
            issue: item.sourceIssue,
            result: "manual",
            coverage: item.coverage,
            note: item.note || "",
        };
    }

    const body = mergeRequest(manifest.apiDefaults?.request, item);
    const started = Date.now();
    let response;

    try {
        response = await fetchWithTimeout(apiBase, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "User-Agent": "MediaBridge-provider-smoke/1.0",
            },
            body: JSON.stringify(body),
        }, API_TIMEOUT_MS);
    } catch (error) {
        throw new Error(`API request failed: ${error.message}`);
    }

    const text = await response.text();
    let payload;
    try {
        payload = JSON.parse(text);
    } catch {
        throw new Error(`API returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    if (!response.ok) {
        throw new Error(`API HTTP ${response.status}: ${JSON.stringify(payload)}`);
    }
    if (payload.status === "error") {
        const code = payload.error?.code || "unknown";
        throw new Error(`API error: ${code}`);
    }

    const successfulStatuses = new Set(["tunnel", "redirect", "picker", "local-processing"]);
    if (!successfulStatuses.has(payload.status)) {
        throw new Error(`unexpected API status: ${payload.status}`);
    }

    const targets = [];
    if (payload.status === "tunnel" || payload.status === "redirect") {
        if (payload.url) targets.push(payload.url);
    } else if (payload.status === "picker") {
        for (const entry of (payload.picker || []).slice(0, 3)) {
            if (entry?.url) targets.push(entry.url);
        }
        if (payload.audio) targets.push(payload.audio);
    } else if (payload.status === "local-processing") {
        for (const target of payload.tunnel || []) {
            if (target) targets.push(target);
        }
    }

    const assertionTarget = targets[0] || payload.url || "";
    if (item.assertions?.targetUrlMustContain && !assertionTarget.includes(item.assertions.targetUrlMustContain)) {
        throw new Error(
            `target URL does not contain required fragment "${item.assertions.targetUrlMustContain}": ${assertionTarget.slice(0, 220)}`
        );
    }

    const shouldProbe = item.probeBytes ?? manifest.apiDefaults?.probeBytes ?? true;
    const probes = [];
    if (shouldProbe) {
        if (targets.length === 0) throw new Error("successful API response contained no media target");

        for (const target of targets.slice(0, 3)) {
            const resolved = new URL(target, apiBase).toString();
            let media;
            try {
                media = await fetchWithTimeout(resolved, {
                    method: "GET",
                    headers: {
                        Range: "bytes=0-0",
                        "Accept-Encoding": "identity",
                        "User-Agent": "MediaBridge-provider-smoke/1.0",
                    },
                }, MEDIA_TIMEOUT_MS);
            } catch (error) {
                throw new Error(`media probe failed: ${error.message}`);
            }

            if (!media.ok) {
                throw new Error(`media probe HTTP ${media.status}`);
            }
            if (!media.body) {
                throw new Error("media probe returned no response body");
            }

            const reader = media.body.getReader();
            const first = await reader.read();
            await reader.cancel().catch(() => {});
            const bytes = first.value?.byteLength || 0;
            if (first.done || bytes === 0) {
                throw new Error("media probe returned zero bytes");
            }
            probes.push({
                status: media.status,
                bytes,
                contentType: media.headers.get("content-type") || "",
            });
        }
    }

    return {
        id: item.id,
        service: item.service,
        issue: item.sourceIssue,
        result: "pass",
        coverage: item.coverage,
        apiStatus: payload.status,
        durationMs: Date.now() - started,
        probes,
        note: item.note || "",
    };
}

function markdown(results, apiBase) {
    const rows = results.map((r) => {
        const mark = r.result === "pass" ? "PASS" : r.result === "manual" ? "MANUAL" : "FAIL";
        const detail = r.result === "fail"
            ? r.error
            : r.apiStatus
                ? `${r.apiStatus}; ${r.probes?.length || 0} media probe(s)`
                : r.note || "";
        return `| ${mark} | ${r.service} | #${r.issue} | ${r.id} | ${String(detail).replaceAll("|", "\\|")} |`;
    });

    return [
        "## MediaBridge provider compatibility audit",
        "",
        `API: \`${apiBase}\``,
        "",
        "| Result | Service | Upstream issue | Case | Detail |",
        "| --- | --- | ---: | --- | --- |",
        ...rows,
        "",
    ].join("\n");
}

async function main() {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_URL, "utf8"));
    validateManifest(manifest);

    if (validateOnly) {
        console.log(`validated ${manifest.cases.length} provider compatibility cases`);
        return;
    }

    const apiBase = process.env.MEDIA_BRIDGE_API_URL;
    assert(apiBase && /^https?:\/\//.test(apiBase), "MEDIA_BRIDGE_API_URL is required");

    const results = [];
    for (const item of manifest.cases) {
        try {
            const result = await processCase(apiBase, manifest, item);
            results.push(result);
            console.log(`[${result.result.toUpperCase()}] ${item.id}`);
        } catch (error) {
            results.push({
                id: item.id,
                service: item.service,
                issue: item.sourceIssue,
                result: "fail",
                coverage: item.coverage,
                error: error.message,
                note: item.note || "",
            });
            console.error(`[FAIL] ${item.id}: ${error.message}`);
        }
    }

    const report = {
        generatedAt: new Date().toISOString(),
        apiBase,
        results,
        counts: {
            pass: results.filter((r) => r.result === "pass").length,
            fail: results.filter((r) => r.result === "fail").length,
            manual: results.filter((r) => r.result === "manual").length,
        },
    };

    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

    const summary = markdown(results, apiBase);
    if (process.env.GITHUB_STEP_SUMMARY) {
        await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
    } else {
        console.log("\n" + summary);
    }

    if (report.counts.fail > 0 && !allowFailures) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
