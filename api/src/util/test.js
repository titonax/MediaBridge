import fs from "node:fs";
import path from "node:path";

import { env } from "../config.js";
import { runTest } from "../misc/run-test.js";
import { loadJSON } from "../misc/load-from-fs.js";
import { Red, Bright } from "../misc/console-text.js";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { randomizeCiphers } from "../misc/randomize-ciphers.js";

import { services } from "../processing/service-config.js";

const getTestPath = service => path.join('./src/util/tests/', `./${service}.json`);
const getTests = (service) => loadJSON(getTestPath(service));

const parseServiceList = (value, fallback = []) => new Set(
    value
        ? value.split(',').map(service => service.trim()).filter(Boolean)
        : fallback
);

const policy = loadJSON('./src/util/service-test-policy.json') || { strict: [] };

// Live service checks depend on third-party sites and are therefore observed
// by default. A service becomes a CI gate only after it is explicitly
// promoted to strict in the version-controlled policy (or via an override).
const strictServices = parseServiceList(
    process.env.TEST_STRICT_SERVICES,
    policy.strict || []
);

const appendGithubSummary = (service, result) => {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) return;

    const mode = strictServices.has(service) ? 'strict' : 'observed';
    const summary = [
        `### cobalt service regression: ${service}`,
        '',
        `Mode: **${mode}**`,
        '',
        '| result | count |',
        '| --- | ---: |',
        `| passed | ${result.passed} |`,
        `| hard failures | ${result.hardFails} |`,
        `| ignored failures | ${result.ignoredFails} |`,
        '',
    ].join('\n');

    fs.appendFileSync(summaryPath, summary);
}

const runTestsFor = async (service) => {
    const tests = getTests(service);
    let fails = 0, hardFails = 0, ignoredFails = 0;

    if (!tests) {
        throw "no such service: " + service;
    }

    for (const test of tests) {
        const { name, url, params, expected } = test;
        const canFail = test.canFail || !strictServices.has(service);

        try {
            await runTest(url, params, expected);
            console.log(`${service}/${name}: ok`);

        } catch (e) {
            fails++;
            if (canFail) {
                ignoredFails++;
            } else {
                hardFails++;
            }

            let failText = canFail ? `${Red('FAIL')} (ignored)` : Bright(Red('FAIL'));
            if (canFail && process.env.GITHUB_ACTION) {
                console.log(`::warning title=${service}/${name.replace(/,/g, ';')}::failed and was ignored`);
            }

            console.error(`${service}/${name}: ${failText}`);
            const errorString = e.toString().split('\n');
            let c = '┃';
            errorString.forEach((line, index) => {
                line = line.replace('!=', Red('!='));

                if (index === errorString.length - 1) {
                    c = '┗';
                }

                console.error(`   ${c}`, line);
            });
        }
    }

    const result = {
        passed: tests.length - fails,
        fails,
        hardFails,
        ignoredFails,
    };

    appendGithubSummary(service, result);
    return result;
}

const printHeader = (service, padLen) => {
    const padding = padLen - service.length;
    service = service.padEnd(1 + service.length + padding, ' ');
    console.log(service + '='.repeat(50));
}

// TODO: remove env.externalProxy in a future version
setGlobalDispatcher(
    new EnvHttpProxyAgent({ httpProxy: env.externalProxy || undefined })
);

env.streamLifespan = 10000;
env.apiURL = 'http://x/';
randomizeCiphers();

const action = process.argv[2];
switch (action) {
    case "get-services":
        const fromConfig = Object.keys(services);

        const missingTests = fromConfig.filter(
            service => {
                const tests = getTests(service);
                return !tests || tests.length === 0
            }
        );

        if (missingTests.length) {
            console.error('services have no tests:', missingTests);
            process.exitCode = 1;
            break;
        }

        console.log(JSON.stringify(fromConfig));
        break;

    case "run-tests-for":

        try {
            const { hardFails } = await runTestsFor(process.argv[3]);
            process.exitCode = Number(!!hardFails);
        } catch (e) {
            console.error(e);
            process.exitCode = 1;
            break;
        }

        break;
    default:
        const maxHeaderLen = Object.keys(services).reduce((n, v) => v.length > n ? v.length : n, 0);
        const failCounters = {};

        for (const service in services) {
            printHeader(service, maxHeaderLen);
            const { fails, hardFails } = await runTestsFor(service);
            failCounters[service] = fails;
            console.log();

            if (!process.exitCode && hardFails)
                process.exitCode = 1;
        }

        console.log('='.repeat(50 + maxHeaderLen));
        console.log(
            Bright('total fails:'),
            Object.values(failCounters).reduce((a, b) => a + b)
        );
        for (const [ service, fails ] of Object.entries(failCounters)) {
            if (fails) console.log(`${Bright(service)} fails: ${fails}`);
        }
}
