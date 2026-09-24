import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('version info works without a .git directory', async () => {
    const originalCwd = process.cwd();
    const temp = await mkdtemp(join(tmpdir(), 'mediabridge-version-info-'));

    try {
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
        await rm(temp, { recursive: true, force: true });
    }
});
