import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const gitEnvKeys = [
    'MEDIABRIDGE_GIT_COMMIT',
    'MEDIABRIDGE_GIT_BRANCH',
    'MEDIABRIDGE_GIT_REMOTE',
    'RENDER_GIT_COMMIT',
    'RENDER_GIT_BRANCH',
    'RENDER_GIT_REPO_SLUG',
    'GITHUB_SHA',
    'GITHUB_REF_NAME',
    'CF_PAGES_BRANCH',
    'WORKERS_CI_BRANCH',
];

test('version info works without a .git directory', async () => {
    const originalCwd = process.cwd();
    const originalEnv = Object.fromEntries(
        gitEnvKeys.map(key => [key, process.env[key]])
    );
    const temp = await mkdtemp(join(tmpdir(), 'mediabridge-version-info-'));

    try {
        for (const key of gitEnvKeys) {
            delete process.env[key];
        }

        await writeFile(
            join(temp, 'package.json'),
            JSON.stringify({ version: '0.0.0-test' })
        );

        process.chdir(temp);

        const moduleUrl = new URL(
            `./index.js?test=${Date.now()}`,
            pathToFileURL(`${originalCwd}/packages/version-info/`)
        );

        const info = await import(moduleUrl.href);

        assert.equal(await info.getCommit(), 'unknown');
        assert.equal(await info.getBranch(), 'unknown');
        assert.equal(await info.getRemote(), 'unknown');
        assert.equal(await info.getVersion(), '0.0.0-test');
    } finally {
        process.chdir(originalCwd);

        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }

        await rm(temp, { recursive: true, force: true });
    }
});
