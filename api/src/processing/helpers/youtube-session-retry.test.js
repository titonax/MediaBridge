import test from "node:test";
import assert from "node:assert/strict";

import { retryYouTubeWithSession } from "./youtube-session-retry.js";

const bot = {
    playability_status: {
        status: "LOGIN_REQUIRED",
        reason: "Sign in to confirm you’re not a bot",
    },
};

const ok = {
    playability_status: {
        status: "OK",
    },
};

const sessionTokens = {
    potoken: "p".repeat(180),
    visitor_data: "visitor",
};

test("does not retry non-bot responses", async () => {
    let created = false;

    const result = await retryYouTubeWithSession({
        info: ok,
        videoId: "abcdefghijk",
        sessionTokens,
        createClient: async () => {
            created = true;
        },
        log: {},
    });

    assert.equal(result.usedSession, false);
    assert.equal(created, false);
});

test("does not retry without complete session tokens", async () => {
    const result = await retryYouTubeWithSession({
        info: bot,
        videoId: "abcdefghijk",
        sessionTokens: {
            potoken: "p".repeat(180),
        },
        createClient: async () => {
            throw new Error("should not run");
        },
        log: {},
    });

    assert.equal(result.usedSession, false);
    assert.equal(result.info, bot);
});

test("replaces bot response when PO-token session succeeds", async () => {
    const calls = [];

    const yt = {
        getBasicInfo: async (videoId, { client }) => {
            calls.push({ videoId, client });
            return ok;
        },
    };

    const result = await retryYouTubeWithSession({
        info: bot,
        videoId: "abcdefghijk",
        sessionTokens,
        client: "MWEB",
        createClient: async () => yt,
        log: {},
    });

    assert.equal(result.usedSession, true);
    assert.equal(result.info, ok);
    assert.equal(result.yt, yt);
    assert.equal(result.client, "MWEB");
    assert.deepEqual(calls, [
        {
            videoId: "abcdefghijk",
            client: "MWEB",
        },
    ]);
});

test("preserves original bot response when session is still challenged", async () => {
    const result = await retryYouTubeWithSession({
        info: bot,
        videoId: "abcdefghijk",
        sessionTokens,
        createClient: async () => ({
            getBasicInfo: async () => bot,
        }),
        log: {},
    });

    assert.equal(result.usedSession, false);
    assert.equal(result.info, bot);
});

test("preserves original bot response when session retry throws", async () => {
    const result = await retryYouTubeWithSession({
        info: bot,
        videoId: "abcdefghijk",
        sessionTokens,
        createClient: async () => ({
            getBasicInfo: async () => {
                throw new Error("network");
            },
        }),
        log: {},
    });

    assert.equal(result.usedSession, false);
    assert.equal(result.info, bot);
});
