import { existsSync } from 'node:fs';
import { join, parse } from 'node:path';
import { cwd } from 'node:process';
import { readFile } from 'node:fs/promises';

const UNKNOWN = 'unknown';

const findFile = (file) => {
    let dir = cwd();

    while (dir !== parse(dir).root) {
        if (existsSync(join(dir, file))) {
            return dir;
        }

        dir = join(dir, '../');
    }
}

const root = findFile('.git');
const pack = findFile('package.json');

const readGit = async (filename) => {
    if (!root) {
        return;
    }

    try {
        return await readFile(join(root, filename), 'utf8');
    } catch {
        return;
    }
}

const firstEnv = (...keys) => {
    for (const key of keys) {
        const value = process.env[key];
        if (value) return value;
    }
}

export const getCommit = async () => {
    const envCommit = firstEnv(
        'MEDIABRIDGE_GIT_COMMIT',
        'RENDER_GIT_COMMIT',
        'GITHUB_SHA'
    );
    if (envCommit) return envCommit;

    const log = await readGit('.git/logs/HEAD');
    return log
        ?.split('\n')
        ?.filter(String)
        ?.pop()
        ?.split(' ')[1]
        || UNKNOWN;
}

export const getBranch = async () => {
    const envBranch = firstEnv(
        'MEDIABRIDGE_GIT_BRANCH',
        'RENDER_GIT_BRANCH',
        'CF_PAGES_BRANCH',
        'WORKERS_CI_BRANCH',
        'GITHUB_REF_NAME'
    );
    if (envBranch) return envBranch;

    const head = await readGit('.git/HEAD');
    return head
        ?.replace(/^ref: refs\/heads\//, '')
        ?.trim()
        || UNKNOWN;
}

export const getRemote = async () => {
    const envRemote = firstEnv(
        'MEDIABRIDGE_GIT_REMOTE',
        'RENDER_GIT_REPO_SLUG'
    );
    if (envRemote) return envRemote;

    let remote = (await readGit('.git/config'))
                    ?.split('\n')
                    ?.find(line => line.includes('url = '))
                    ?.split('url = ')[1];

    if (remote?.startsWith('git@')) {
        remote = remote.split(':')[1];
    } else if (remote?.startsWith('http')) {
        remote = new URL(remote).pathname.substring(1);
    }

    remote = remote?.replace(/\.git$/, '');

    return remote || UNKNOWN;
}

export const getVersion = async () => {
    if (!pack) {
        throw 'no package root found';
    }

    const { version } = JSON.parse(
        await readFile(join(pack, 'package.json'), 'utf8')
    );

    return version;
}
