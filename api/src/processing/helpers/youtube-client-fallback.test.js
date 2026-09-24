import test from "node:test";
import assert from "node:assert/strict";

import {
    buildYouTubeClientCandidates,
    getBasicInfoWithClientFallback,
    isYouTubeBotChallenge,
} from "./youtube-client-fallback.js";

const ok = {
    playability_status: {
        status: "OK",
    },
};

const bot = {
    playability_status: {
        status: "LOGIN_REQUIRED",
        reason: "Sign in to confirm you’re not a bot",
    },
};

test("detects only YouTube bot challenges", () => {
    assert.equal(isYouTubeBotChallenge(bot), true);
    assert.equal(isYouTubeBotChallenge(ok), false);
    assert.equal(
        isYouTubeBotChallenge({
            playability_status: {
                status: "LOGIN_REQUIRED",
                reason: "This video may be inappropriate for some users.",
            },
        }),
        false
    );
});

test("keeps preferred client first and removes duplicates", () => {
    assert.deepEqual(
        buildYouTubeClientCandidates("ANDROID"),
        ["ANDROID", "YTSTUDIO_ANDROID", "YTMUSIC_ANDROID", "IOS"]
    );
});

test("returns immediately when preferred client works", async () => {
    const calls = [];

    const result = await getBasicInfoWithClientFallback({
        videoId: "abcdefghijk",
        preferredClient: "IOS",
        getBasicInfo: async (_, { client }) => {
            calls.push(client);
            return ok;
        },
        log: {},
    });

    assert.equal(result.client, "IOS");
    assert.deepEqual(calls, ["IOS"]);
});

test("falls back after bot challenge", async () => {
    const calls = [];

    const result = await getBasicInfoWithClientFallback({
        videoId: "abcdefghijk",
        preferredClient: "IOS",
        getBasicInfo: async (_, { client }) => {
            calls.push(client);
            return client === "ANDROID" ? ok : bot;
        },
        log: {},
    });

    assert.equal(result.client, "ANDROID");
    assert.deepEqual(calls, ["IOS", "ANDROID"]);
});

test("continues when a fallback client throws", async () => {
    const calls = [];

    const result = await getBasicInfoWithClientFallback({
        videoId: "abcdefghijk",
        preferredClient: "IOS",
        getBasicInfo: async (_, { client }) => {
            calls.push(client);

            if (client === "ANDROID") {
                throw new Error("unsupported");
            }

            if (client === "YTSTUDIO_ANDROID") {
                return ok;
            }

            return bot;
        },
        log: {},
    });

    assert.equal(result.client, "YTSTUDIO_ANDROID");
    assert.deepEqual(calls, ["IOS", "ANDROID", "YTSTUDIO_ANDROID"]);
});

test("preserves bot result when every client is challenged", async () => {
    const result = await getBasicInfoWithClientFallback({
        videoId: "abcdefghijk",
        preferredClient: "IOS",
        getBasicInfo: async () => bot,
        log: {},
    });

    assert.equal(isYouTubeBotChallenge(result.info), true);
    assert.equal(result.client, "IOS");
    assert.deepEqual(result.tried, [
        "IOS",
        "ANDROID",
        "YTSTUDIO_ANDROID",
        "YTMUSIC_ANDROID",
    ]);
});
