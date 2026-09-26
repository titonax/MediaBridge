import test from "node:test";
import assert from "node:assert/strict";

import {
    buildCustomInnertubeClient,
    mergeInnertubeClientContext,
    needsYouTubePlayer,
} from "./youtube-client-context.js";

test("builds unsupported Innertube client context", () => {
    assert.deepEqual(
        buildCustomInnertubeClient({
            client: "VISIONOS",
            context: {
                clientVersion: "1.02",
                osName: "visionOS",
            },
            supportedClients: ["IOS", "ANDROID"],
        }),
        {
            clientName: "VISIONOS",
            clientVersion: "1.02",
            osName: "visionOS",
        }
    );
});

test("does not override supported clients", () => {
    assert.equal(
        buildCustomInnertubeClient({
            client: "IOS",
            context: { clientVersion: "1.02" },
            supportedClients: ["IOS", "ANDROID"],
        }),
        undefined
    );
});

test("merges custom fields into session client context", () => {
    assert.deepEqual(
        mergeInnertubeClientContext(
            {
                client: {
                    clientName: "WEB",
                    clientVersion: "1",
                    hl: "en",
                },
                user: {
                    lockedSafetyMode: false,
                },
            },
            {
                clientName: "VISIONOS",
                clientVersion: "1.02",
                osName: "visionOS",
            }
        ),
        {
            client: {
                clientName: "VISIONOS",
                clientVersion: "1.02",
                hl: "en",
                osName: "visionOS",
            },
            user: {
                lockedSafetyMode: false,
            },
        }
    );
});

test("custom clients only need a player when the format has no URL", () => {
    assert.equal(
        needsYouTubePlayer({
            format: { url: "https://example.test/media" },
            customClient: { clientName: "VISIONOS" },
            client: "VISIONOS",
            noCipherClients: [],
        }),
        false
    );

    assert.equal(
        needsYouTubePlayer({
            format: {},
            customClient: { clientName: "VISIONOS" },
            client: "VISIONOS",
            noCipherClients: [],
        }),
        true
    );
});

test("supported clients keep the existing no-cipher behavior", () => {
    assert.equal(
        needsYouTubePlayer({
            format: {},
            client: "IOS",
            noCipherClients: ["IOS"],
        }),
        false
    );

    assert.equal(
        needsYouTubePlayer({
            format: {},
            client: "WEB",
            noCipherClients: ["IOS"],
        }),
        true
    );
});
